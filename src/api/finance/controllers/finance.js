'use strict';

/**
 * finance controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::finance.finance', ({ strapi }) =>  ({
    async sync(ctx) {

      let year

      if(!ctx.query.financialYear) {
        const currentDate = new Date()

        // If current month is before August, we're still in the previous fiscal year (fiscal years start in August)
        if(currentDate.getMonth() < 7) {
            year = (currentDate.getFullYear()) - 1
        }
        // Is before december of the current financial year
        else {
            year = currentDate.getFullYear()
        }
      }
      else {
        year = parseInt(ctx.query.financialYear, 10)
      }

      const result = await strapi.service('api::finance.finance').sync(ctx.request.body.accessToken, year)
    
      ctx.send(result, 200)
    }
}))
