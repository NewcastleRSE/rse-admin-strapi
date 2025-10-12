'use strict'

/**
 *  project controller
 */

const { createCoreController } = require('@strapi/strapi').factories

module.exports = createCoreController('api::project.project', ({ strapi }) =>  ({
  async sync(ctx) {
    try {
      const response = await strapi.service('api::project.project').sync()
      ctx.send(response, 200)
    } catch (err) {
      ctx.send({ error: err.message }, 500)
    }
  }
}))
