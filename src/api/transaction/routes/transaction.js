'use strict';

/**
 * transaction router.
 */

// const { createCoreRouter } = require('@strapi/strapi').factories;
// const defaultRouter = createCoreRouter("api::transaction.transaction");

// const customRouter = (innerRouter, extraRoutes = []) => {
//   let routes;
//   return {
//     get prefix() {
//       return innerRouter.prefix;
//     },
//     get routes() {
//       if (!routes) routes = innerRouter.routes.concat(extraRoutes);
//       return routes;
//     },
//   };
// };

// const customRoutes = [
//   {
//     method: "POST",
//     path: "/transactions/sync",
//     handler: "api::transaction.transaction.sync",
//   },
//   {
//     method: "POST",
//     path: "/transactions/upload",
//     handler: "api::transaction.transaction.upload",
//   }
// ]

// module.exports = customRouter(defaultRouter, customRoutes);

module.exports = {
  routes: [

    {
      method: "POST",
      path: "/transactions/sync",
      handler: "transaction.sync"
    },
    {
      method: "POST",
      path: "/transactions/upload",
      handler: "transaction.upload"
    },
    {
      method: "GET",
      path: "/transactions",
      handler: "transaction.find"
    },
    {
      method: "GET",
      path: "/transactions/:id",
      handler: "transaction.findOne"
    },
    {
      method: "POST",
      path: "/transactions",
      handler: "transaction.create"
    },
    {
      method: "PUT",
      path: "/transactions/:id",
      handler: "transaction.update"
    },
    {
      method: "DELETE",
      path: "/transactions/:id",
      handler: "transaction.delete"
    }
  ],
};
