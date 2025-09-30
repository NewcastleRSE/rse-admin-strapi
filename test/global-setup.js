const { createStrapi } = require('@strapi/strapi')
const fs = require('fs')
const { resolve } = require('path')

let instance

module.exports = async () => {

  // Ensure the .tmp directory exists
  fs.mkdir(resolve(__dirname, './../.tmp/'), { recursive: true }, (err) => {
    if (err) throw err;

    // Copy the seed database to a temp file before starting the tests
    fs.copyFile(resolve(__dirname, './database/seed.db'), resolve(__dirname, './../.tmp/test.db'), (err) => {
      if (err) throw err
      console.log(`${resolve(__dirname, './database/seed.db')} was copied to ${resolve(__dirname, './../.tmp/test.db')}`)
    })
  })

  // Start Strapi instance
  if (!instance) {
    const app = createStrapi()
    instance = await app.load()

    await instance.server.mount()
  }
  return instance
}