module.exports = {
  routes: [
    {
     method: 'GET',
     path: '/timesheets',
     handler: 'timesheet.find',
     config: {
       policies: [],
       middlewares: [],
     },
    },
  ],
};
