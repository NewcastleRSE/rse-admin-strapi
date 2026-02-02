'use strict';

/**
 * invoice controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::invoice.invoice', ({ strapi }) =>  ({
    async create(ctx) {
      try {
        ctx.body = { data: await strapi.service("api::invoice.invoice").create(ctx.request.body) }
        ctx.status = 201
      } catch (err) {
        console.error(err)
        ctx.body = err;
      }
    },
    // Custom add method to handle file uploads, expects 'files' containing the PDF file, 'year', 'month', and 'clockifyID' in the request body
    async add(ctx) {
    const { files } = ctx.request.files || {};
    const body = ctx.request.body;

    if (!files) return ctx.badRequest('No file uploaded');

    const result = await strapi.service('api::invoice.invoice').add(files, body);
    return result;
    }
}));
