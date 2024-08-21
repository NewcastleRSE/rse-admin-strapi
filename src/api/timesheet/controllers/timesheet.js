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
  findOne: async (ctx, next) => {
    try {
      ctx.body = await service.findOne(ctx.params.id, ctx.request.query)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  project: async (ctx, next) => {
    try {
      let period = ctx.request.headers['period']
      ctx.body = await service.findProject(ctx.params.id, period)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
  allocated: async (ctx, next) => {
    try {
      let period = ctx.request.headers['period']
      ctx.body = await service.findAllocatedTime(period)
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
  },
  user: async (ctx, next) => {
    try {
      let period = ctx.request.headers['period']
      ctx.body = await service.findUser(ctx.params.id, period)
    } catch (err) {
      ctx.body = err
      console.error(err)
    }
  },
}
