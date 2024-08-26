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
      path: "/timesheets/leave",
      handler: "timesheet.leave",
      config: {
        policies: [],
        middlewares: [],
      },
    }
  ],
};
