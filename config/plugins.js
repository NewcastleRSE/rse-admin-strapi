module.exports = () => ({
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
  });