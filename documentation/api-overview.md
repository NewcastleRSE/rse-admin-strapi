# API Overview

This project uses two route styles:

- Core Strapi routers generated with `createCoreRouter(...)`
- Explicit custom route declarations in `routes/*.js`

## Domain modules

The following API modules are present under `src/api`:

- assignment
- capacity
- contact
- facility
- finance
- invoice
- project
- rse
- timesheet
- transaction
- webhooks

## Custom routes declared in code

These are the non-default endpoints explicitly defined in route files.

### Project

- `GET /projects/sync` (handler: `project.sync`)

### Timesheet

- `GET /timesheets` (handler: `timesheet.find`)
- `GET /timesheets/leave` (handler: `timesheet.leave`)
- `GET /rses/:id/calendar` (handler: `timesheet.calendar`)
- `GET /timesheets/summary` (handler: `timesheet.summary`)
- `GET /timesheets/utilisation` (handler: `timesheet.utilisation`)

### Finance

- `POST /finances/sync` (handler: `api::finance.finance.sync`)

### Invoice

- `POST /invoices/add` (handler: `api::invoice.invoice.add`)

### Webhooks

- `POST /webhooks/hubspot` (handler: `webhooks.hubspot`)

## Core resource routes

Modules using `createCoreRouter(...)` also expose the usual Strapi resource routes for their content types (for example list/get/create/update/delete according to permissions and configuration).

For exact generated paths and schemas, see:

- `src/extensions/documentation/documentation/1.0.0/full_documentation.json`

## Notes

- Some custom timesheet routes apply middleware `api::timesheet.financial-year`.
- Route authorization defaults vary by endpoint and plugin configuration.
