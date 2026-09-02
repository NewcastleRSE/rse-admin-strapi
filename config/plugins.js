module.exports = ({env}) => ({
    'users-permissions': {
      config: {
        jwtManagement: 'refresh',
        sessions: {
          accessTokenLifespan: 604800, // 1 week
          maxRefreshTokenLifespan: 2592000, // 30 days
          idleRefreshTokenLifespan: 604800, // 7 days
        }
      },
    },
    sentry: {
    enabled: true,
    config: {
      dsn: env('NODE_ENV') === 'development' ? null : env('SENTRY_DSN'),
      sendMetadata: true,
    },
  },
  });