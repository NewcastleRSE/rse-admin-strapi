'use strict';

/**
 * finance service
 */

const { createCoreService } = require('@strapi/strapi').factories
const { DateTime } = require('luxon')
const axios = require('axios')
const ExcelJS = require('exceljs')
const { Client }  = require('@microsoft/microsoft-graph-client')

module.exports = createCoreService('api::finance.finance', ({ strapi }) =>  ({
    async sync(accessToken, financialYear) {
        

        const authProvider = (callback) => {

            let error = null

            if (!accessToken) {
                error = new Error('Missing access token')
            }
            callback(error, accessToken)
        }

        try {

            const client = Client.init({ authProvider })

            const hostname = process.env.FINANCE_SHAREPOINT_HOSTNAME,
                  folderPath = process.env.FINANCE_SHAREPOINT_FOLDER_PATH,
                  overviewSheetName = process.env.FINANCE_OVERVIEW_SHEET,
                  transactionsSheetName = process.env.FINANCE_TRANSACTIONS_SHEET

            const financialYearsURL = `/sites/${hostname}/drive/root:/${folderPath}:/children`

            // Get list of financial year folders
            const response = await client.api(financialYearsURL).get()
            const financialYearFolders = response.value ? response.value : []

            // Find the folder matching the requested financial year
            const matchingFinancialYear = financialYearFolders.find(folder => folder.name === `${financialYear}-${(financialYear + 1).toString().slice(-2)}`)

            // Throw error if no matching folder found
            if(!matchingFinancialYear) {
                throw new Error(`No folder found for financial year ${financialYear}-${(financialYear + 1).toString().slice(-2)}`)
            }

            // Get list of monthly report files in the financial year folder
            const monthlyReportsURL = `/sites/${hostname}/drive/items/${matchingFinancialYear.id}/children`
            const reports = await client.api(monthlyReportsURL).get()

            // Find the most recently modified report
            const mostRecentMonth = reports.value.reduce(function(prev, current) {
                return (prev && DateTime.fromISO(prev.lastModifiedDateTime) > DateTime.fromISO(current.lastModifiedDateTime)) ? prev : current
            })

            // Download the most recent report
            const file = await axios.get(mostRecentMonth['@microsoft.graph.downloadUrl'], { responseType: 'stream'})

            // Read the Excel file
            const workbook = new ExcelJS.Workbook()
            await workbook.xlsx.read(file.data)
            const overviewSheet = workbook.getWorksheet(overviewSheetName)

            // retrieve the existing finance record for the year
            let finance = await strapi.entityService.findMany('api::finance.finance', { filters: { year: financialYear }, limit: 1 }).then(res => res[0])

            // prepare actuals and budget data structures
            let actualsColumns = [{
                label: 'name',
                type: 'text',
                required: false
            }]

            let budgetColumns = [{
                label: 'name',
                type: 'text',
                required: false
            }]

            let actualsRows = []
            let budgetRows = []

            // define columns for category name and each period
            for(let i = 0; i < 12; i++) {

                const column = {
                    label: `${financialYear.toString().slice(-2)}/${(financialYear + 1).toString().slice(-2)} P${i + 1}`,
                    type: 'text',
                    required: false
                }

                actualsColumns.push(column)
                budgetColumns.push(column)
            }

            // define rows for each category section
            const sections = {
                incomeRows: overviewSheet.getRows(5, 5),
                salaryRows: overviewSheet.getRows(14, 5),  
                nonSalaryRows: overviewSheet.getRows(23, 27),
                indirectRows: overviewSheet.getRows(55, 5)
            }

            // iterate through each section and extract actuals and budget data
            for(const section in sections) {

                // loop through each row in the section
                for(const row of sections[section]) {
                    let actualsRowData, budgetRowData
                    
                    actualsRowData = [ row.getCell(2).value ]
                    budgetRowData = [ row.getCell(2).value ]

                    // extract actuals for periods 1-12 (columns 4-15)
                    for(let a = 4; a <= 15; a++) {
                        actualsRowData.push(row.getCell(a).result || 0)
                    }

                    // extract budget for periods 1-12 (columns 16-27)
                    for(let b = 16; b <= 27; b++) {
                        budgetRowData.push(row.getCell(b).result || 0)
                    }

                    actualsRows.push(actualsRowData)
                    budgetRows.push(budgetRowData)
                }
            }

            const latestData = {
                totalActualIncome: overviewSheet.getCell('C13').result || 0,
                totalActualSalary: overviewSheet.getCell('C22').result || 0,
                totalActualNonSalary: overviewSheet.getCell('C53').result || 0,
                totalBudgetedIncome: overviewSheet.getCell('P13').result || 0,
                totalBudgetedSalary: overviewSheet.getCell('P22').result || 0,
                totalBudgetedNonSalary: overviewSheet.getCell('P53').result || 0,
                actual: {
                    columns: actualsColumns,
                    rows: actualsRows
                },
                budget: {
                    columns: budgetColumns,
                    rows: budgetRows
                }
            }

            // if no record exists, create one
            if(!finance) {

                const payload = { 
                    year: financialYear,
                    startDate: DateTime.fromObject({ year: financialYear, month: 8, day: 1 }).toISODate(),
                    endDate: DateTime.fromObject({ year: financialYear + 1, month: 7, day: 31 }).toISODate(),
                    ...latestData
                }

                finance = await strapi.service('api::finance.finance').create({ data: payload })
            }
            // otherwise update the existing record
            else {

                const payload = { 
                    year: finance.year,
                    startDate: finance.startDate,
                    endDate: finance.endDate,
                    ...latestData
                }

                finance = await strapi.service('api::finance.finance').update(finance.documentId, { data: payload })
            }

            // return the finance record
            return finance

        } catch (error) {
            throw new Error('Failed to sync finance data: ' + error.message)
        }
    }
}))
