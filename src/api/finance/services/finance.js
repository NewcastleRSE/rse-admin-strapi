'use strict';

/**
 * finance service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::finance.finance');
