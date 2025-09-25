const { resolve } = require('path')

module.exports = ({ env }) => ({
  connection: {
    client: 'sqlite',
    connection: {
      filename: resolve(__dirname, '../../../.tmp/test.db')
    },
    useNullAsDefault: true,
    debug: false
  },
});