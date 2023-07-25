'use strict';

/**
 * invoice controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::invoice.invoice', ({ strapi }) =>  ({
    async create(ctx) {

      const projectId = ctx.request.body.data.project,
            year = ctx.request.body.data.year,
            month = ctx.request.body.data.month

      try {
        const pdfData = await strapi.service("api::invoice.invoice").create(ctx.request.body)
        ctx.body = pdfData
        ctx.type = 'application/pdf'
        ctx.set('Content-Type', 'application/pdf')
        ctx.set('Content-disposition', `attachment;filename=${projectId}-${month}-${year}.pdf`)
      } catch (err) {
        console.error(err)
        ctx.body = err;
      }
    }
})
);
