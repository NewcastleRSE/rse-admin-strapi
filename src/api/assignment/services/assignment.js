'use strict';

/**
 * assignment service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::assignment.assignment');
