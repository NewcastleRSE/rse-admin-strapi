'use strict'

/**
 * A set of functions called 'actions' for `timesheet`
 */

const { createCoreController } = require('@strapi/strapi').factories

module.exports = createCoreController('api::timesheet.timesheet', ({ strapi }) =>  ({
  async find(ctx) {
    try {
      ctx.body = await strapi.service("api::timesheet.timesheet").find(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  async leave(ctx) {
    try {
      ctx.body = await strapi.service("api::timesheet.timesheet").leave(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  async calendar(ctx) {
    try {
      ctx.body = await strapi.service("api::timesheet.timesheet").calendar(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  async summary(ctx) {
    try {
      ctx.body = await strapi.service("api::timesheet.timesheet").summary(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  }
}))
