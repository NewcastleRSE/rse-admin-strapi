'use strict';

/**
 *  transaction controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::transaction.transaction', ({ strapi }) =>  ({
    async upload(ctx) {
        const file = ctx.request.files['files.file']

        let entity = {
          error: 'Incorrect MIME Type. Please upload an Excel Spreadsheet'
        }

        if(file.type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          entity = await strapi.service('api::transaction.transaction').upload(file)
        }

        const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

        return this.transformResponse(sanitizedEntity);
      },
}))
