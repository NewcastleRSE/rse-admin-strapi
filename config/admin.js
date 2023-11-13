module.exports = ({ env }) => ({
  apiToken: {
    salt: env('API_TOKEN_SALT', 'example-salt')
  },
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'example-secret'),
  },
  transfer: { 
    token: { 
      salt: env('TRANSFER_TOKEN_SALT', 'example-salt'),
    } 
  },
});
