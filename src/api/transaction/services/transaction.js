'use strict';

/**
 * transaction service.
 */
const { DateTime } = require('luxon')
const { createCoreService } = require('@strapi/strapi').factories;
const ExcelJS = require('exceljs')
const TransactionsWorksheetName = process.env.TRANSACTIONS_SHEET.replace(/_/g, ' ')
const HeaderRow = process.env.TRANSACTIONS_HEADER.replace(/_/g, ' ').split(',')

module.exports = createCoreService('api::transaction.transaction', ({ strapi }) =>  ({
    async upload(file) {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file.path)
        const transactionSheet = workbook.getWorksheet(TransactionsWorksheetName)

        let transactions = []

        // clear all previous transactions; ID is always not null
        await strapi.db.query('api::transaction.transaction').deleteMany({
            where: {
              id: {
                $notNull: true,
              },
            },
        });

        transactionSheet.eachRow(async function(row, rowNumber) {
            if(rowNumber === 1) {

                // Is the first row the same as we're expecting, if not bail out
                if(JSON.stringify(row.values.slice(1)) !== JSON.stringify(HeaderRow.slice(1))) {
                    return { error: `Unexpected header row. Expected ${HeaderRow.slice(1)} but received ${row.values.slice(1)}`}
                }
            }
            else {

                let transaction = {
                    costElement: Number(row.values[3]),
                    costElementDescription: row.values[4],	
                    documentNumber: Number(row.values[5]),
                    documentHeader: row.values[6],
                    name: row.values[7],
                    fiscalYear: Number(row.values[8]),
                    fiscalPeriod: Number(row.values[9]),
                    documentDate: DateTime.fromJSDate(new Date(row.values[10])).toISODate(), 	
                    postedDate: DateTime.fromJSDate(new Date(row.values[11])).toISODate(),
                    // SAP gets the debit and credit wrong way around, times -1 to fix
                    value: (row.values[12].hasOwnProperty('result') ? parseFloat(row.values[12].result) : parseFloat(row.values[12])) * -1,
                    bwCategory: row.values[13].hasOwnProperty('result') ? row.values[13].result : row.values[13], 	
                    ieCategory: row.values[14].hasOwnProperty('result') ? row.values[14].result : row.values[14],
                    internalCategory: null
                }

                // Check for invalid numbers
                if(
                    isNaN(transaction.costElement) ||
                    isNaN(transaction.documentNumber) ||
                    isNaN(transaction.fiscalYear) ||
                    isNaN(transaction.fiscalPeriod) ||
                    isNaN(transaction.value)
                ) {
                    console.error(transaction)
                }

                // Is the transaction an expense or income
                if(transaction.value < 0) {
                    // Salary Costs
                    if (transaction.ieCategory === 'Salary Expenditure') {
                        transaction.internalCategory = transaction.ieCategory
                    }
                    // Cloud costs
                    else if(
                        transaction.name.toLowerCase().includes('azure') ||
                        transaction.name.toLowerCase().includes('google cloud') ||
                        transaction.name.toLowerCase().includes('amazonaws')
                    ) {
                        transaction.internalCategory = 'Cloud'
                    }
                    // Room Fees
                    else if (transaction.documentHeader.toLowerCase() === 'catalyst internal tenant') {
                        transaction.internalCategory = 'Estates'
                    }
                    // Travel
                    else if (transaction.name.toLowerCase().includes('travel agencies')) {
                        transaction.internalCategory = 'Travel'
                    }
                    // Conference
                    else if (
                        transaction.documentHeader.toLowerCase().includes('conference') ||
                        transaction.documentHeader.toLowerCase().includes('data innovation sh') ||
                        transaction.documentHeader.toLowerCase().includes('native tickets') ||
                        transaction.name.toLowerCase().includes('conference') ||
                        transaction.costElementDescription.toLowerCase().includes('conference')
                    ) {
                        transaction.internalCategory = 'Conference'
                    }
                    // Expenses
                    else if (
                        transaction.costElementDescription.toLowerCase().includes('milage') ||
                        transaction.costElementDescription.toLowerCase().includes('subsistence')
                    ) {
                        transaction.internalCategory = 'Expenses'
                    }
                    // Equipment
                    else if (
                        transaction.name.toLowerCase().includes('macbook') ||
                        transaction.name.toLowerCase().includes('monitor')
                    ) {
                        transaction.internalCategory = 'Equipment'
                    }
                    // Software
                    else if (
                        transaction.documentHeader.toLowerCase().includes('shutterstock')
                    ) {
                        transaction.internalCategory = 'Software'
                    }
                    // Catch-All
                    else { 
                        transaction.internalCategory = 'Other'
                    }
                }
                else {
                    transaction.internalCategory = transaction.ieCategory
                }

                transactions.push(transaction)
            }
        })

        let count = await strapi.db.query('api::transaction.transaction').createMany({ data: transactions })

        return { message: 'Successfully uploaded transaction data', count }
        
      },
}))
