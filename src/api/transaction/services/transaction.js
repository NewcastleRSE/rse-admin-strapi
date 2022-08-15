'use strict';

/**
 * transaction service.
 */
const { DateTime } = require('luxon')
const { createCoreService } = require('@strapi/strapi').factories;
const ExcelJS = require('exceljs')
const WorksheetName = process.env.TRANSACTIONS_SHEET.replace(/_/g, ' ')
const HeaderRow = process.env.TRANSACTIONS_HEADER.replace(/_/g, ' ').split(',')

module.exports = createCoreService('api::transaction.transaction', ({ strapi }) =>  ({
    async upload(file) {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file.path)
        const worksheet = workbook.getWorksheet(WorksheetName)

        let transactions = []

        // clear all previous transactions; ID is always not null
        await strapi.db.query('api::transaction.transaction').deleteMany({
            where: {
              id: {
                $notNull: true,
              },
            },
        });

        worksheet.eachRow(async function(row, rowNumber) {
            if(rowNumber === 1) {

                // Is the first row the same as we're expecting, if not bail out
                if(JSON.stringify(row.values.slice(1)) !== JSON.stringify(HeaderRow.slice(1))) {
                    return { error: `Unexpected header row. Expected ${HeaderRow.slice(1)} but received ${row.values.slice(1)}`}
                }
            }
            else {
                transactions.push({
                    costElement: Number(row.values[3]),
                    costElementDescription: row.values[4],	
                    documentNumber: Number(row.values[5]),
                    documentHeader: row.values[6],
                    name: row.values[7],
                    fiscalYear: Number(row.values[8]),
                    fiscalPeriod: Number(row.values[9]),
                    documentDate: DateTime.fromJSDate(new Date(row.values[10])).toISODate(), 	
                    postedDate: DateTime.fromJSDate(new Date(row.values[11])).toISODate(),
                    value: parseFloat(row.values[12]),
                    bwCategory: row.values[13].hasOwnProperty('result') ? row.values[13].result : row.values[13], 	
                    ieCategory: row.values[14].hasOwnProperty('result') ? row.values[14].result : row.values[14]
                })
            }
        })

        let count = await strapi.db.query('api::transaction.transaction').createMany({
            data: transactions
          });

        return { message: 'Successfully uploaded transaction data', count }
      },
}))
