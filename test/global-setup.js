const { createStrapi } = require('@strapi/strapi')
const fs = require('fs')

let instance

module.exports = async () => {

  // Copy the seed database to a temp file before starting the tests
  fs.copyFile('./test/database/seed.db', '.tmp/test.db', (err) => {
    if (err) throw err
    console.log('./test/database/seed.db was copied to .tmp/test.db')
  })

  // Start Strapi instance
  if (!instance) {
    const app = createStrapi()
    instance = await app.load()

    await instance.server.mount()
  }
  return instance
}