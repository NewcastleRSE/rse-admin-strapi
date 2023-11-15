'use strict';

/**
 *  project controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::project.project', ({ strapi }) =>  ({
    async byHubSpotID(ctx) {
        try {
            ctx.body = await strapi.service('api::project.project').byHubSpotID(ctx.params.id);
        } catch (err) {
            ctx.body = err;
            console.error(err);
        }
    }
}));
