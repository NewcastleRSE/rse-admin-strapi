'use strict';

/**
 *  rse controller
 */

const { createCoreController } = require('@strapi/strapi').factories

module.exports = createCoreController('api::rse.rse', ({ strapi }) => ({
    find: async (ctx) => {
        try {
            return await strapi.service('api::rse.rse').find(ctx.request.query)
        } catch (err) {
            console.error(err)
            return err
        }
    },
    // Override findOne to use a filter on the find method for service code reuse
    findOne: async (ctx) => {
        try {
            ctx.request.query.filters = { id: ctx.params.id }  
            const response = await strapi.service('api::rse.rse').find(ctx.request.query)
            if (response.results.length === 1) {
                return {
                    data: response.results[0],
                    meta: {}
                }
            }
        } catch (err) {
            console.error(err)
            return err
        }
    }
}))
