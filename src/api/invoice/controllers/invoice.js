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
    }
}));
