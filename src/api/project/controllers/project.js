'use strict'

/**
 *  project controller
 */

const { createCoreController } = require('@strapi/strapi').factories

module.exports = createCoreController('api::project.project', ({ strapi }) =>  ({
  async sync(ctx) {
    // Test line you can temporarily run anywhere in your code to verify
strapi.plugin('sentry').service('sentry').sendError(new Error('Test Sentry Integration'));
    try {
      const response = await strapi.service('api::project.project').sync()
      ctx.send(response, 200)
    } catch (err) {
      ctx.send({ error: err.message }, 500)
    }
  }
}))
