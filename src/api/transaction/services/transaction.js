'use strict';

/**
 * transaction service.
 */
const { DateTime } = require('luxon')
const { createCoreService } = require('@strapi/strapi').factories
const axios = require('axios')
const ExcelJS = require('exceljs')
const TransactionsWorksheetName = process.env.TRANSACTIONS_SHEET.replace(/_/g, ' ')
const HeaderRow = process.env.TRANSACTIONS_HEADER.replace(/_/g, ' ').split(',')

module.exports = createCoreService('api::transaction.transaction', ({ strapi }) =>  ({
    async upload(file) {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file.filepath)
        const transactionSheet = workbook.getWorksheet(TransactionsWorksheetName)

        let transactions = [], 
            errorCount = 0

        // clear all previous transactions; ID is always not null
        await strapi.db.query('api::transaction.transaction').deleteMany({
            where: {
              id: {
                $notNull: true,
              },
            },
        })

        transactionSheet.eachRow(async function(row, rowNumber) {
            if(rowNumber === 1) {
                // Is the first row the same as we're expecting, if not bail out
                if(JSON.stringify(row.values.slice(1)) !== JSON.stringify(HeaderRow.slice(1))) {
                    return { error: `Unexpected header row. Expected ${HeaderRow.slice(1)} but received ${row.values.slice(1)}`}
                }
            }
            else {

                // Calculate the current financial year (starts on 1st August)
                const postedDate = DateTime.fromJSDate(new Date(row.values[13]))
                let fiscalYear
                if (postedDate.month >= 8) {
                    fiscalYear = postedDate.year
                } else {
                    fiscalYear = postedDate.year - 1
                }

                let transaction = {
                    costElement: Number(row.values[1]),
                    costElementDescription: row.values[2],	
                    documentNumber: Number(row.values[12]),
                    documentHeader: row.values[10].toString(),
                    name: row.values[8],
                    fiscalYear: fiscalYear,
                    fiscalPeriod: Number(row.values[5]),
                    // documentDate: DateTime.fromJSDate(new Date(row.values[13])).toISODate(),
                    postedDate: postedDate.toISODate(),
                    // SAP gets the debit and credit wrong way around, times -1 to fix
                    value: (row.values[14].hasOwnProperty('result') ? parseFloat(row.values[14].result) : parseFloat(row.values[14])) * -1,
                    // bwCategory: row.values[14].hasOwnProperty('result') ? row.values[14].result : row.values[14], 	
                    // ieCategory: row.values[15].hasOwnProperty('result') ? row.values[15].result : row.values[15],
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
                    errorCount++
                    console.error(transaction)
                }

                // Is the transaction an expense or income
                if(transaction.value < 0) {
                    try {
                    // Salary Costs
                    // if (transaction.ieCategory === 'Salary Expenditure') {
                    //     transaction.internalCategory = transaction.ieCategory
                    // }
                    // Cloud costs
                    if(
                        transaction.name.toLowerCase().includes('C77') ||
                        transaction.name.toLowerCase().includes('google cloud') ||
                        transaction.name.toLowerCase().includes('amazonaws')
                    ) {
                        transaction.internalCategory = 'Cloud'
                    }
                    // Room Fees
                    else if (transaction.documentHeader && transaction.documentHeader.toLowerCase() === 'catalyst internal tenant') {
                        transaction.internalCategory = 'Estates'
                    }
                    // Travel
                        else if (
                            transaction.name.toLowerCase().includes('travel agencies')  ||
                            transaction.name.toLowerCase().includes('train') ||
                            transaction.name.toLowerCase().includes('hotel')
                    ) {
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

                } catch (error) {
                    console.error('Error categorizing transaction:')
                    console.error(transaction)
                    console.error(error)
                    transaction.internalCategory = 'Other'
                }
            }
                else {
                    transaction.internalCategory = 'Other'
                }

                transactions.push(transaction)
            }
        })

        if(transactions.length > 0) {
            console.log(`Prepared ${transactions.length} transactions for upload with ${errorCount} errors.`)

            try {
                await strapi.db.query('api::transaction.transaction').createMany({ data: transactions })
                return { message: 'Successfully uploaded transaction data' }
            }
            catch (error) {
                console.error(`Failed to add ${transactions.length} transactions to the database. Encountered ${errorCount} errors.`)
                console.error(error)
            }
        }
        else {
            console.log('No transactions to upload.')
            return { message: 'No transactions to upload' }
        }
    },
    async sync(ctx) {
        console.log(ctx.request.body)

        const azureConfig = { 
            baseURL: 'https://graph.microsoft.com/v1.0/',
            headers: { 
                authorization: `Bearer: ${ctx.request.body.accessToken}`
            }
        }

        const response = await axios.get('/me/drives', azureConfig)


        return response.body
    }
}))
