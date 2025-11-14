'use strict'

/**
 * finance router
 */

const { createCoreRouter } = require('@strapi/strapi').factories
const defaultRouter = createCoreRouter('api::finance.finance')

const customRouter = (innerRouter, extraRoutes = []) => {
  let routes
  return {
    get prefix() {
      return innerRouter.prefix
    },
    get routes() {
      if (!routes) routes = innerRouter.routes.concat(extraRoutes)
      return routes
    },
  }
}

const customRoutes = [
  {
    method: "POST",
    path: "/finances/sync",
    handler: "api::finance.finance.sync",
  }
]

module.exports = customRouter(defaultRouter, customRoutes)
