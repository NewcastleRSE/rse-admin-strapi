'use strict';

/**
 * transaction router.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;
const defaultRouter = createCoreRouter("api::transaction.transaction");

const customRouter = (innerRouter, extraRoutes = []) => {
  let routes;
  return {
    get prefix() {
      return innerRouter.prefix;
    },
    get routes() {
      if (!routes) routes = innerRouter.routes.concat(extraRoutes);
      return routes;
    },
  };
};

const customRoutes = [
  {
    method: "POST",
    path: "/transactions/upload",
    handler: "api::transaction.transaction.upload",
  }
];

module.exports = customRouter(defaultRouter, customRoutes);
