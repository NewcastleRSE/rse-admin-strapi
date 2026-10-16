# Architecture Overview

## What this service does

The service is a Strapi-based backend for the RSE Admin tool. It aggregates data from multiple systems (for example HubSpot, Clockify, Microsoft Graph and internal data) and exposes REST endpoints consumed by the RSE web app.

## High-level structure

- `src/api/*`: Business domains (assignment, project, timesheet, invoice, etc.)
- `config/*`: Runtime configuration for server, database, plugins and middleware
- `src/extensions/*`: Strapi extension customizations (including generated documentation artifacts)
- `utils/*`: Utility helpers (for example holiday checks and Slack messaging)
- `test/*`: Integration tests and API mocks
- `database/migrations/*`: Database migration files

## Runtime flow

1. Strapi boots using settings from `config/server.js`.
2. Database connection is configured from environment variables in `config/database.js`.
3. Plugin setup (auth/session token policy, sentry) is loaded from `config/plugins.js`.
4. API routes in `src/api/*/routes` dispatch to controllers/services.
5. Scheduled cron tasks configured in `config/cron-tasks.js` execute on schedule.

## Configuration highlights

- Authentication: users-permissions plugin is configured for refresh-token style session management.
- Observability: Sentry is enabled outside development when `SENTRY_DSN` is set.
- Database: MySQL is the active client in default config.
- Cron: enabled through `config/server.js` and mapped to tasks from `config/cron-tasks.js`.
