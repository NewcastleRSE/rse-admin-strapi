module.exports = {
  routes: [
    {
     method: 'POST',
     path: '/webhooks/hubspot',
     handler: 'webhooks.hubspot',
     config: {
       policies: [],
       middlewares: [],
     },
    },
  ],
};
