'use strict';

/**
 *  transaction controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::transaction.transaction', ({ strapi }) =>  ({
    async upload(ctx) {
        const file = ctx.request.files['files.file']

        const entity = await strapi.service('api::transaction.transaction').upload(file);
        const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

        return this.transformResponse(sanitizedEntity);
      },
}))
