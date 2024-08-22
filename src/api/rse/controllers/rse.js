'use strict';

/**
 *  rse controller
 */

const { createCoreController } = require('@strapi/strapi').factories

module.exports = createCoreController('api::rse.rse', ({ strapi }) => ({
    calendar: async (ctx, next) => {
        try {
            return await strapi.service('api::rse.rse').calendar(ctx.params.id, ctx.request.query)
        } catch (err) {
            console.error(err)
            return err
        }
    }
}))
