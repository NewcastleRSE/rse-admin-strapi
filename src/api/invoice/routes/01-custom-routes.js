module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/invoices/add',
      handler: 'api::invoice.invoice.add'
    },
  ],
};