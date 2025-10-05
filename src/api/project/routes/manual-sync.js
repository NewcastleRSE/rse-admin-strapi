'use strict'

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/projects/sync',
      handler: 'project.sync',
      auth: true
    }
  ]
}
