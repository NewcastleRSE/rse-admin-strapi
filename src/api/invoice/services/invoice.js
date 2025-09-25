'use strict'

const { DateTime } = require('luxon')
const { PDFDocument } = require('pdf-lib')
const Hubspot = require('@hubspot/api-client')
const hubspotClient = new Hubspot.Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
const fontKit = require('@pdf-lib/fontkit')
const fs = require('fs/promises')
const path = require('path')

/**
 * invoice service
 */

const { createCoreService } = require('@strapi/strapi').factories
const { setupCache } = require('axios-cache-interceptor')
let axios = require('axios')

const instance = axios.create()
axios = setupCache(instance,
    {
        methods: ['get', 'post']
    })

const clockifyConfig = {
    baseURL: `https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`,
    headers: {
        'X-Api-Key': process.env.CLOCKIFY_KEY
    },
    cache: {
        maxAge: 60 * 60 * 1000
    }
}

module.exports = createCoreService('api::invoice.invoice', ({ strapi }) => ({
    async create(params) {
        const period = {
            year: params.data.year,
            month: params.data.month
        }

        const project = await strapi.service("api::project.project").findOne(params.data.project)

        if(!project) { throw 'Project not found' }
        //if(project.costModel === 'Facility' && !project.lineItems) { throw 'Project does not a day rate set' }

        const timesheets = await strapi.service("api::timesheet.timesheet").findOne(project.clockifyID, period)

        const documentNumber = `${project.hubspotId}-${params.data.month.toUpperCase()}-${params.data.year}`

        // Convert seconds to hours, then 7.24 hours per day
        const days = Math.round((timesheets.data.totals[0].totalTime / 3600) / 7.24)

        const invoices = await strapi.entityService.findMany('api::invoice.invoice', {
            filters: {
                documentNumber: documentNumber
            },
        })

        // Calculate the current facility year (starts on 1st Feb)
        const now = DateTime.now()
        let facilityYear
        if (now.month >= 2) {
            facilityYear = now.year - 2000
        } else {
            facilityYear = now.year - 2001
        }

        const products = await hubspotClient.crm.products.searchApi.doSearch({
            filterGroups: [
                {
                    filters: [
                        {
                            propertyName: 'name',
                            operator: 'CONTAINS_TOKEN',
                            value: `${facilityYear}/${facilityYear + 1}`
                        }
                    ]
                }
            ],
            sorts: ['name'],
            properties: ['name', 'description', 'price'],
            limit: 100,
            after: 0
        })

        let standardRate = products.results.find(product => product.properties.name === `Standard Day Rate ${facilityYear}/${facilityYear + 1}`).price,
            seniorRate = products.results.find(product => product.properties.name === `Senior Day Rate ${facilityYear}/${facilityYear + 1}`).price

        //TODO figure out how to select the right rate
        // for now just use standard rate
        const dayRate = Number(standardRate) || 0

        params.data.project = [project.documentId]
        params.data.generated = DateTime.utc().toISODate()
        params.data.documentNumber = documentNumber
        params.data.standard_price = dayRate
        params.data.standard_units = days

        let invoice = null

        if(invoices.length) {
            params.data.documentId = invoices[0].documentId
            await super.update(params.data.documentId, params)
        }
        else {
            try {
                invoice = await super.create(params)
            } catch (error) {
                console.error(error.details.errors)
                throw error
            }
        }

        invoice.project = await strapi.entityService.findOne('api::project.project', project.documentId)

        const formatter = new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
        });

        const pdfData = await fs.readFile(path.resolve(__dirname, './ir-template.pdf'))
        const pdfDoc = await PDFDocument.load(pdfData)

        pdfDoc.registerFontkit(fontKit)
        const fontBytesBold = await fs.readFile(path.resolve(__dirname, './arial-black.otf'))
        const fontBold = await pdfDoc.embedFont(fontBytesBold)

        const form = pdfDoc.getForm()

        const sapDocument = form.getTextField('SAP Document')
        sapDocument.updateAppearances(fontBold)
        sapDocument.setText(documentNumber)
        sapDocument.enableReadOnly()

        const refNumber = form.getTextField('REF Number')
        refNumber.updateAppearances(fontBold)
        refNumber.setText(`${project.hubspotId}`)
        refNumber.enableReadOnly()

        const created = form.getTextField('Created')
        created.updateAppearances(fontBold)
        created.setText(`${params.data.generated}`)
        created.enableReadOnly()

        const enteredBy = form.getTextField('Entered By')
        enteredBy.updateAppearances(fontBold)
        enteredBy.setText(`Mark Turner`)
        enteredBy.enableReadOnly()

        const description = form.getTextField('Description')
        description.updateAppearances(fontBold)
        description.setText(`RSE services for ${project.dealname}.`)
        description.enableReadOnly()

        const quantity = form.getTextField('Quantity')
        quantity.updateAppearances(fontBold)
        quantity.setText(`${days}`)
        quantity.enableReadOnly()

        const price = form.getTextField('Price')
        price.updateAppearances(fontBold)
        price.setText(`${formatter.format(dayRate)}`)
        price.enableReadOnly()

        const total = form.getTextField('Total')
        total.updateAppearances(fontBold)
        total.setText(`${formatter.format(dayRate * days)}`)
        total.enableReadOnly()

        const account = form.getTextField('Account')
        account.updateAppearances(fontBold)
        account.setText(`${project.accountCode}`)
        account.enableReadOnly()

        invoice.pdf = Buffer.from(await pdfDoc.save()).toString('base64')
        
        return invoice
    },
    async month(params) {

        // get facility rate projects where the cost model is facility and the stage is 'Awaiting allocation', "Allocated', or 'Completed'
        const facilityRateProjects = await strapi.db.query('api::project.project').findMany({
            where: {
                costModel: 'facility',
                stage: {
                    $in: ['Awaiting Allocation', 'Funded & Awaiting Allocated', 'Allocated', 'Completed']
                }
            }
            
        })

        // todo create start and end date dynamically

        // Calling Clockify
        const response = await axios.get('/projects?hydrated=true&page-size=5000', clockifyConfig)

        // Filtering the clockify projects that are in the project list
        const clockifyFacilityProjects = response.data.filter(p => facilityRateProjects.map(pr => pr.clockifyID).includes(p.id))


        // console.log(response.data[0])
        response.data.forEach(async element => {

            const projectId = element.id

            const url = `https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports/detailed`
            const data = {
                "dateRangeStart": "2025-07-01T00:00:00Z",
                "dateRangeEnd": "2025-08-01T00:00:00Z",
                "detailedFilter": {
                    "page": 1,
                    "pageSize": 1000
                },
                "exportType": "JSON",
                "rounding": false,
                "projects": {
                    "ids": [
                        projectId
                    ]
                }
            }

            const headers = {
                "x-api-key": process.env.CLOCKIFY_KEY,
                "Content-Type": "application/json"
            }

            axios.post(url, data, { headers: headers })
                .then(response => {
                   // console.log(response.data.totals) // Axios automatically parses JSON responses
                })
                .catch(error => {
                    //console.error(error)
                })



            //console.log(entries)
        })





        return true
    }
}))
