'use strict'

const { DateTime } = require('luxon')
const { PDFDocument } = require('pdf-lib')
const Hubspot = require('@hubspot/api-client')
const hubspotClient = new Hubspot.Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
const fontKit = require('@pdf-lib/fontkit')
const fs = require('fs/promises')
const path = require('path')
const fss = require('fs');

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

        const editable = params.editable || false

        const project = await strapi.service("api::project.project").findOne(params.data.project)

        if (!project) { throw 'Project not found' }
        //if(project.costModel === 'Facility' && !project.lineItems) { throw 'Project does not a day rate set' }

        const timesheets = await strapi.service("api::timesheet.timesheet").findOne(project.clockifyID, period)
        // document number format is hubspot ID, 3 letter month, and 2 number year, seperated by commas
        const documentNumber = `${project.hubspotID}-${params.data.month.toUpperCase().substring(0, 3)}-${params.data.year.toString().substring(2)}`

        // divide time between standard and senior rates

        // Convert seconds to hours, then 7.24 hours per day
        const totalDays = Math.round((timesheets.data.totals[0].totalTime / 3600) / 7.24)
        let standardDays = 0
        let seniorDays = 0


        const peopleDays = []

        // try to build seperate standard and senior days from timesheet entries
        try {


            // check groupOne exists and is an array
            if (Array.isArray(timesheets.data.groupOne)) {

                timesheets.data.groupOne.forEach(entry => {
                    const clocked = { "person": entry.name, "days": Math.round((entry.duration / 3600) / 7.24) }
                    peopleDays.push(clocked)
                })

                // get assignments active for the current month from assignment and check if is a senior or standard rate, if no assigment is found assume standard
                const assignments = await strapi.documents('api::assignment.assignment').findMany(
                    {
                        filters:
                        {
                            project:
                            {
                                documentId: project.documentId
                            },
                            $and: [
                                {
                                    start: {
                                        $lte: DateTime.fromObject({ year: period.year, month: DateTime.fromFormat(period.month, 'LLLL').month, day: 1 }).endOf('month').toISODate()
                                    },
                                },
                                {
                                    end: {
                                        $gte: DateTime.fromObject({ year: period.year, month: DateTime.fromFormat(period.month, 'LLLL').month, day: 1 }).startOf('month').toISODate()
                                    }
                                }
                            ]
                        },
                        populate: {
                            rse: true
                        }
                    },

                )

                // for each person who has clocked time, look at their allocation and rate
                peopleDays.forEach(person => {
                    const assignment = assignments.find(a => a.rse.displayName.toLowerCase() === person.person.toLowerCase())
                    if (assignment && assignment.rate && assignment.rate === 'senior') {
                        seniorDays += person.days
                    } else {
                        standardDays += person.days
                    }
                })


            }
            // todo combine entries into people if multiple entries can come from same person?
        } catch (error) {
            console.log('problem with calculating senior vs standard days so using standard only, error: ', error)
            // if can't access groupOne in clockify timesheet response, just look at total time and use standard rate
            standardDays = totalDays
        }


        const invoices = await strapi.entityService.findMany('api::invoice.invoice', {
            filters: {
                documentNumber: documentNumber
            },
        })

        // Calculate the current facility year (starts on 1st Feb) for the invoice date

        let facilityYear
        if (DateTime.fromFormat(period.month, 'LLLL').month >= 2) {
            facilityYear = period.year - 2000
        } else {
            facilityYear = period.year - 2001
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

        // todo also need to consider external projects where 
        // we charge VAT and a higher day rate??

        let standardRate = 0, seniorRate = 0
        products.results.forEach(product => {
            if (product.properties.name === `Standard Day Rate ${facilityYear}/${facilityYear + 1}`) {
                standardRate = product.properties.price
            } else if (product.properties.name === `Senior Day Rate ${facilityYear}/${facilityYear + 1}`) {
                seniorRate = product.properties.price
            }
        }
        )

        const standardDayRate = Number(standardRate) || 0
        const seniorDayRate = Number(seniorRate) || 0

        params.data.project = [project.documentId]
        params.data.generated = DateTime.utc().toISODate()
        params.data.documentNumber = documentNumber
        params.data.standard_price = standardDayRate
        params.data.standard_units = standardDays
        params.data.senior_price = seniorDayRate
        params.data.senior_units = seniorDays

        //console.log('save in db: ', params.data)

        let invoice = null


        // either update existing invoice or create a new one
        if (invoices.length) {
            params.data.documentId = invoices[0].documentId
            invoice = await super.update(params.data.documentId, params)
        }
        else {
            try {
                invoice = await super.create(params)
            } catch (error) {
                console.error(error.details.errors)
                throw error
            }
        }

        invoice.project = await strapi.documents('api::project.project').findOne({
            documentId: project.documentId
        })

        // Invoice is created or update in database, now generate the PDF
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


        const refNumber = form.getTextField('REF Number')
        refNumber.updateAppearances(fontBold)
        refNumber.setText(`${project.hubspotID}`)

        const created = form.getTextField('Created')
        created.updateAppearances(fontBold)
        created.setText(`${params.data.generated}`)


        const enteredBy = form.getTextField('Entered By')
        enteredBy.updateAppearances(fontBold)
        enteredBy.setText(`RSE Team`)
        if (!editable) {
            enteredBy.enableReadOnly()
            created.enableReadOnly()
            refNumber.enableReadOnly()
            sapDocument.enableReadOnly()
        }

        // senior line
        if (seniorDays > 0) {
            const descriptionTxt = documentNumber + ' - ' + 'senior' + ' - ' + project.name
            const description = form.getTextField('Description2')
            //description.updateAppearances(fontBold)
            description.setText(`${descriptionTxt}`)
            // do not make description read only so that finance can copy and paste into transactions spreadsheet
            //description.enableReadOnly()


            const quantity = form.getTextField('Quantity2')
            //quantity.updateAppearances(fontBold)
            quantity.setText(`${seniorDays}`)


            const price = form.getTextField('Price2')
            //price.updateAppearances(fontBold)
            price.setText(`${seniorDayRate}`)



            const total = form.getTextField('Total2')
            //total.updateAppearances(fontBold)
            total.setText(`${formatter.format(seniorDayRate * seniorDays)}`)


            const account = form.getTextField('Account2')
            //account.updateAppearances(fontBold)
            account.setText(`${project.account}`)

            if (!editable) {
                account.enableReadOnly()
                total.enableReadOnly()
                price.enableReadOnly()
                quantity.enableReadOnly()
            }
        }

        // standard line
        const descriptionTxt = documentNumber + ' - ' + 'standard' + ' - ' + project.name
        const description = form.getTextField('Description')
        //description.updateAppearances(fontBold)
        description.setText(`${descriptionTxt}`)
        //description.enableReadOnly()


        const quantity = form.getTextField('Quantity')
        //quantity.updateAppearances(fontBold)
        quantity.setText(`${standardDays}`)


        const price = form.getTextField('Price')
        //price.updateAppearances(fontBold)
        price.setText(`${standardDayRate}`)

        const total = form.getTextField('Total')
        //total.updateAppearances(fontBold)
        total.setText(`${formatter.format(standardDayRate * standardDays)}`)


        const account = form.getTextField('Account')
        //account.updateAppearances(fontBold)
        account.setText(`${project.account}`)
        if (!editable) {
            account.enableReadOnly()
            total.enableReadOnly()
            price.enableReadOnly()
            quantity.enableReadOnly()
        }

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
    },
    async add(file, body) {
        let { year, month, clockifyID } = body;
        month = month?.toLowerCase()

        try {
            const projects = await strapi.documents("api::project.project").findMany({
                filters: {
                    clockifyID: clockifyID
                }
            })
            const project = projects[0];

            if (!project) { throw 'Project not found' }

            const pdfBuffer = fss.readFileSync(file.filepath);
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            const form = pdfDoc.getForm();

            const extractedData = {
                project: project.documentId,
                year: parseInt(year),
                month: month,
                documentNumber: form.getTextField('SAP Document').getText(),
                generated: new Date(form.getTextField('Created').getText()).toISOString().split('T')[0],
                standard_price: parseFloat(form.getTextField('Price').getText()) || 0,
                standard_units: parseInt(form.getTextField('Quantity').getText()) || 0,
                senior_price: parseFloat(form.getTextField('Price2').getText()) || 0,
                senior_units: parseInt(form.getTextField('Quantity2').getText()) || 0
            };

            let entry = null;
            // if document number already exists, update instead of creating new
            const existingInvoices = await strapi.documents('api::invoice.invoice').findMany({
                filters: {
                    documentNumber: extractedData.documentNumber
                },
            });
            if (existingInvoices.length > 0) {

                //extractedData.documentId = existingInvoices[0].documentId;
                entry = await strapi.documents('api::invoice.invoice').update({
                    documentId: existingInvoices[0].documentId,
                    data: {
                        project: extractedData.project,
                        year: extractedData.year,
                        month: extractedData.month,
                        documentNumber: extractedData.documentNumber,
                        generated: extractedData.generated,
                        standard_price: extractedData.standard_price,
                        standard_units: extractedData.standard_units,
                        senior_price: extractedData.senior_price,
                        senior_units: extractedData.senior_units,

                    },

                })

            } else {

                entry = await strapi.documents('api::invoice.invoice').create({
                    data: {
                        project: extractedData.project,
                        year: extractedData.year,
                        month: extractedData.month,
                        documentNumber: extractedData.documentNumber,
                        generated: extractedData.generated,
                        standard_price: extractedData.standard_price,
                        standard_units: extractedData.standard_units,
                        senior_price: extractedData.senior_price,
                        senior_units: extractedData.senior_units,

                    }
                });
            }

            // get full invoice including project and transaction to return
            const fullEntry = await strapi.documents('api::invoice.invoice').findOne({
                documentId: entry.documentId,
                populate: {
                    project: true,
                    transaction: true
                }
            });

            return fullEntry;

        } catch (err) {
            console.log(err)
            throw new Error(500, `Error parsing PDF: ${err.message}`);
        }
    }
}))

