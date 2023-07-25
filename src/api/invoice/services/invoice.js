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

        const date = new Date(params.data.year, params.data.month, 1);
        const period = date.toLocaleString('default', { month: 'long' });

        const project = await strapi.service("api::project.project").findOne(params.data.project)
        const timesheets = await strapi.service("api::timesheet.timesheet").findProject(project.clockifyID, period)

        params.data.project = [project.id]
        params.data.generated = DateTime.utc().toISODate()
        params.data.period = DateTime.utc(params.data.year, params.data.month + 1).toISO()

        // Convert seconds to hours, then 7.4 hours per day
        const days = Math.round((timesheets.data.total / 3600) / 7.4)

        await super.create(params)

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
        sapDocument.setText(`${project.hubspotId}-${params.data.year}-${params.data.month}`)
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
        
        return Buffer.from(await pdfDoc.save())
    }
}))
