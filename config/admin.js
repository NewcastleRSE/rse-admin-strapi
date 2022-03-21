module.exports = ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', '9204ad6a287f37cef017b31743b4028a'),
  },
});
