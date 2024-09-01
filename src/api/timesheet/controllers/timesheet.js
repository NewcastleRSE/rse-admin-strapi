/**
 * A set of functions called 'actions' for `timesheet`
 */

module.exports = {
  find: async (ctx) => {
    try {
      ctx.body = await strapi.service('api::timesheet.timesheet').find(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  leave: async (ctx) => {
    try {
      ctx.body = await strapi.service('api::timesheet.timesheet').leave(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  calendar: async (ctx) => {
    try {
      ctx.body = await strapi.service('api::timesheet.timesheet').calendar(ctx.request.params.id, ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  summary: async (ctx) => {
    try {
      ctx.body = await strapi.service('api::timesheet.timesheet').summary(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  }
}