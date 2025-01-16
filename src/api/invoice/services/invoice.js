'use strict';

const { DateTime } = require('luxon')
const { PDFDocument } = require('pdf-lib')
const fontKit = require ('@pdf-lib/fontkit')
const fs = require('fs/promises')
const path = require('path')

/**
 * invoice service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::invoice.invoice', ({ strapi }) => ({
    async create(params) {

        const period = {
            year: params.data.year,
            month: params.data.month
        }

        const project = await strapi.service("api::project.project").findOne(params.data.project)
        const timesheets = await strapi.service("api::timesheet.timesheet").findProject(project.clockifyID, period)

        const documentNumber = `${project.hubspotId}-${params.data.month.toUpperCase()}-${params.data.year}`

        // Convert seconds to hours, then 7.24 hours per day
        const days = Math.round((timesheets.data.total / 3600) / 7.24)

        const invoices = await strapi.documents('api::invoice.invoice').findMany({
            filters: {
                documentNumber: documentNumber
            },
        })

        params.data.project = [project.id]
        params.data.generated = DateTime.utc().toISODate()
        params.data.documentNumber = documentNumber
        params.data.price = project.lineItems[0].price
        params.data.units = days

        let invoice = null

        if(invoices.length) {
            params.data.id = invoices[0].id
            await super.update(params.data.id, params)
        }
        else {
            invoice = await super.create(params)
        }

        invoice.project = await strapi.documents('api::project.project').findOne({
            documentId: project.id
        })

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
        price.setText(`${formatter.format(project.lineItems[0].price)}`)
        price.enableReadOnly()

        const total = form.getTextField('Total')
        total.updateAppearances(fontBold)
        total.setText(`${formatter.format(project.lineItems[0].price * days)}`)
        total.enableReadOnly()

        const account = form.getTextField('Account')
        account.updateAppearances(fontBold)
        account.setText(`${project.accountCode}`)
        account.enableReadOnly()

        invoice.pdf = Buffer.from(await pdfDoc.save()).toString('base64')
        
        return invoice
    }
}))
