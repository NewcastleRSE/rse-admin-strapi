module.exports = {
  routes: [
    {
      method: "GET",
      path: "/timesheets",
      handler: "timesheet.find",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/timesheets/:id",
      handler: "timesheet.findOne",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/timesheets/project/:id",
      handler: "timesheet.project",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/timesheets/user/:id",
      handler: "timesheet.user",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
