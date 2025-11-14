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

      if(entity.error) {
        return ctx.badRequest(entity.error)
      }

      const sanitizedEntity = await this.sanitizeOutput(entity, ctx)

      return this.transformResponse(sanitizedEntity)
    },
    async sync(ctx) {

      let year

      if(!ctx.query.financialYear) {
        const currentDate = new Date()

        // Is after december of the current financial year
        if(currentDate.getMonth() < 7) {
            year = (currentDate.getFullYear()) - 1
        }
        // Is before december of the current financial year
        else {
            year = currentDate.getFullYear()
        }
      }
      else {
        year = ctx.query.financialYear
      }

      const result = await strapi.service('api::transaction.transaction').sync(ctx.request.body.accessToken, year)
    
      ctx.send(result, 200)
    }
}))
