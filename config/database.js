const path = require('path');

module.exports = ({ env }) => ({
  connection: {
    client: 'mysql',
    //client: 'sqlite',
    connection: {
      host: env('DATABASE_HOST'),
      port: env.int('DATABASE_PORT'),
      database: env('DATABASE_NAME'),
      user: env('DATABASE_USERNAME'),
      password: env('DATABASE_PASSWORD'),
      ssl: env.bool('DATABASE_SSL') && {
        cert: (Buffer.from(env('DATABASE_CERT'), 'base64').toString()), undefined
      },
      // filename: path.join(__dirname, 'seed.db'),
    },
  },
});
