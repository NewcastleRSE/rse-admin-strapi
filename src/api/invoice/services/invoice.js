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
        const project = await strapi.service("api::project.project").findOne(params.data.project)

        params.data.project = [project.id]
        params.data.generated = DateTime.utc().toISODate()

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
        quantity.setText(`${project.lineItems[0].quantity}`)
        quantity.enableReadOnly()

        const price = form.getTextField('Price')
        price.updateAppearances(fontBold)
        price.setText(`${formatter.format(project.lineItems[0].price)}`)
        price.enableReadOnly()

        const total = form.getTextField('Total')
        total.updateAppearances(fontBold)
        total.setText(`${formatter.format(project.lineItems[0].price * project.lineItems[0].quantity)}`)
        total.enableReadOnly()

        const account = form.getTextField('Account')
        account.updateAppearances(fontBold)
        account.setText(`${project.accountCode}`)
        account.enableReadOnly()
        
        return Buffer.from(await pdfDoc.save())
    }
}))
