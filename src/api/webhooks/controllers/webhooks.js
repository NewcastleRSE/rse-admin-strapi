'use strict';

/**
 * Custom controller for handling webhooks and calling the HubSpot method in the webhooks service.
 */

module.exports = {
    async hubspot(ctx) {
        try {
            const result = await strapi.service('api::webhooks.webhooks').hubspot(ctx.request.body)
            ctx.status = result.status
            ctx.body = { data: result.data }
            return

        } catch (error) {
            ctx.send({
                error: error.message,
            }, 500)
        }
    },
};