# Testing Guide

## Test stack

- Jest
- Supertest
- Nock (for third-party API mocking)

## Run tests

```bash
npm run test
```

Run a specific suite:

```bash
npm run test -- assignments.test.js
```

## API integration suites

Located in `test/api`:

- assignments.test.js
- capacity.test.js
- contacts.test.js
- facilities.test.js
- invoices.test.js
- projects.test.js
- rses.test.js
- timesheets.test.js
- transactions.test.js
- webhooks.test.js

## Test data model

- A SQLite test database is prepared and torn down via:
  - `test/global-setup.js`
  - `test/global-teardown.js`
- HTTP mocks are stored under `test/mocks/data`.

## Coverage scope

Jest is configured to collect coverage from:

- `src/api/**/services/*.js`
- `src/api/**/controllers/*.js`
