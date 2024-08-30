'use strict'

/**
 * A set of functions called 'actions' for `timesheet`
 */

const service = require('../services/timesheet')

module.exports = {
  find: async (ctx) => {
    try {
      ctx.body = await service.find(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  leave: async (ctx) => {
    try {
      ctx.body = await service.leave(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  calendar: async (ctx) => {
    try {
      ctx.body = await service.calendar(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  summary: async (ctx) => {
    try {
      ctx.body = await service.summary(ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  }
}
