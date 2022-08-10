'use strict';

/**
 * transaction service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::transaction.transaction', ({ strapi }) =>  ({
    async upload(file) {
        console.log(file)
        return { message: 'OK' }
      },
}))
