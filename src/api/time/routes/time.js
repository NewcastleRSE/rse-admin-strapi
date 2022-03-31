'use strict';

/**
 * project router.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::time.time', {
    only: ['find', 'findOne']
});
