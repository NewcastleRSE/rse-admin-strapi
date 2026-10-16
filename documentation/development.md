# Development Guide

## Prerequisites

- Node.js 18.x to 22.x
- npm 6+
- MySQL server for local development
- A populated `.env` file with application and database settings

## Install and run

```bash
npm install
npm run build
npm run dev
```

## Common scripts

- `npm run dev`: Start in development with reload
- `npm run build`: Build the admin assets
- `npm start`: Start in production mode
- `npm run test`: Run integration tests

## Important config files

- `config/server.js`: host/port/public URL, cron enablement
- `config/database.js`: MySQL connection and optional SSL cert handling
- `config/plugins.js`: users-permissions session policy and sentry plugin
- `config/middlewares.js`: global Strapi middleware pipeline

## Local auth redirect caveat

If you restore a production-like dataset locally, the Microsoft provider redirect URL may still target production. Update it in the Strapi admin UI under Settings -> Providers.

## Deployment

The current deployment is hosted on the University's Azure tenancy under rse-general and consists of a web app, container registry and mySQL database server.

For environment configuration (.env equivalent) look at the web app on azure where environment variables can be configured.