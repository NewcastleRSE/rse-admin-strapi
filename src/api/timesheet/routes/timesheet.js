module.exports = {
  routes: [
    {
      method: "GET",
      path: "/timesheets",
      handler: "timesheet.find",
      config: {
        policies: [],
        middlewares: ['api::timesheet.financial-year'],
      },
    },
    {
      method: "GET",
      path: "/timesheets/leave",
      handler: "timesheet.leave",
      config: {
        policies: [],
        middlewares: ['api::timesheet.financial-year'],
      },
    },
    {
      method: "GET",
      path: "/rses/:id/calendar",
      handler: "timesheet.calendar",
      config: {
        policies: [],
        middlewares: ['api::timesheet.financial-year'],
      },
    },
    {
      method: "GET",
      path: "/timesheets/summary",
      handler: "timesheet.summary",
      config: {
        policies: [],
        middlewares: ['api::timesheet.financial-year'],
      },
    }
  ],
};