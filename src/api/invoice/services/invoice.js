'use strict';

const { DateTime } = require('luxon')
const { PDFDocument } = require('pdf-lib')
const fs = require('fs/promises')
const path = require('path')

/**
 * invoice service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::invoice.invoice', ({ strapi }) => ({
    async create(params) {
        params.data.generated = DateTime.utc().toISODate()
        await super.create(params)

        const pdfData = await fs.readFile(path.resolve(__dirname, './ir-template.pdf'))
        const pdfDoc = await PDFDocument.load(pdfData)
        
        const pages = pdfDoc.getPages()
        pages[0].drawText('You can modify PDFs too!')
        
        return Buffer.from(await pdfDoc.save({ useObjectStreams: false }))
    }
}))
