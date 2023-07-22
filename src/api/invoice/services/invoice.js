'use strict';

const { DateTime } = require("luxon")

/**
 * invoice service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::invoice.invoice', ({ strapi }) => ({
    async create(params) {
        params.data.generated = DateTime.utc().toISODate()
        return await super.create(params)
    }
}))
