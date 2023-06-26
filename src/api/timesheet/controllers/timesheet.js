"use strict";

/**
 * A set of functions called "actions" for `timesheet`
 */

const service = require("../services/timesheet");

module.exports = {
  find: async (ctx, next) => {
    try {
      ctx.body = await service.findAll();
    } catch (err) {
      ctx.body = err;
      console.error(err);
    }
  },
  findOne: async (ctx, next) => {
    try {
      ctx.body = await service.findOne(ctx.params.id);
    } catch (err) {
      ctx.body = err;
      console.error(err);
    }
  },
  project: async (ctx, next) => {
    try {
      ctx.body = await service.findProject(ctx.params.id);
    } catch (err) {
      ctx.body = err;
      console.error(err);
    }
  },
};
