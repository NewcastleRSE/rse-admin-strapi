'use strict';

/**
 * transaction service.
 */

const { createCoreService } = require('@strapi/strapi').factories;
const ExcelJS = require('exceljs')

module.exports = createCoreService('api::transaction.transaction', ({ strapi }) =>  ({
    async upload(file) {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file.path)
        const worksheet = workbook.getWorksheet('Transactions All Time')

        let transactions = []

        worksheet.eachRow(function(row, rowNumber) {
            transactions.push(row.values)
        })
        console.log(transactions)
        return { transactions }
      },
}))
