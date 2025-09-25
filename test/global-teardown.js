const fs = require('fs')

module.exports = async () =>  {
  const dbSettings = strapi.config.get('database.connection')
  // Close server to release the db-file
  await strapi.server.httpServer.close()

  // Close the connection to the database before deletion
  await strapi.db.connection.destroy()
  
  // Delete test database after all tests have completed
  if (dbSettings && dbSettings.connection && dbSettings.connection.filename) {
    const tmpDbFile = dbSettings.connection.filename
    if (fs.existsSync(tmpDbFile)) {
      fs.unlinkSync(tmpDbFile)
    }
  }
}