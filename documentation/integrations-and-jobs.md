# Integrations and Scheduled Jobs

## External integrations (from dependencies and code)

- HubSpot API (`@hubspot/api-client`)
- Microsoft Graph (`@microsoft/microsoft-graph-client`)
- Slack Web API (`@slack/web-api`)
- Sentry plugin (`@strapi/plugin-sentry`)

## Generated API documentation plugin

The Strapi documentation plugin is enabled in dependencies and its generated output is committed at:

- `src/extensions/documentation/documentation/1.0.0/full_documentation.json`

## Scheduled jobs

Cron tasks are defined in `config/cron-tasks.js` and wired through `config/server.js`.

Current job:

- `clockifyReminder`
- Schedule: `00 09 * * *`
- Behaviour: Sends a Slack reminder on the last workday of the month (using holiday logic in `utils/holidays.js` and delivery in `utils/slack.js`).
