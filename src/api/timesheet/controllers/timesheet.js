'use strict'

/**
 * A set of functions called 'actions' for `timesheet`
 */

const service = require('../services/timesheet')

module.exports = {
  find: async (ctx, next) => {
    try {
      ctx.body = await service.find(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  leave: async (ctx, next) => {
    try {
      ctx.body = await service.findLeave(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  }
}
