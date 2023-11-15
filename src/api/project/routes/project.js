"use strict";

/**
 * project router.
 */

module.exports = {
    routes: [
      {
        method: "GET",
        path: "/projects",
        handler: "project.find",
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: "GET",
        path: "/projects/:id",
        handler: "project.findOne",
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: "POST",
        path: "/projects",
        handler: "project.create",
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: "PUT",
        path: "/projects/:id",
        handler: "project.update",
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: "DELETE",
        path: "/projects/:id",
        handler: "project.delete",
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: "GET",
        path: "/projects/hubspot/:id",
        handler: "project.byHubSpotID",
        config: {
          policies: [],
          middlewares: [],
        },
      }
    ]
}