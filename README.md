# RSE Admin - Strapi
A Strapi powered backend for the RSE Admin Tool

## About

The RSE Admin tool is for tracking the assignment of RSEs to projects, cost recovery and project status. Authentication is managed by University AAD and the backend app brings together data from HubSpot, Clockify and the University Leave System. It also connects to a database to store users and assignment data. All of this is presented via a REST API consumed by the [SPA code](https://github.com/NewcastleRSE/rse-admin-webapp).

### Project Team
Mark Turner, Newcastle University  ([mark.turner@newcastle.ac.uk](mailto:mark.turner@newcastle.ac.uk))    
Kate Court, Newcastle University  ([kate.court@newcastle.ac.uk](mailto:kate.court@newcastle.ac.uk))  
Becky Osselton, Newcastle University  ([rebecca.osselton@newcastle.ac.uk](mailto:rebecca.osselton@newcastle.ac.uk))  

### RSE Contact
Mark Turner  
RSE Team  
Newcastle University  
([mark.turner@newcastle.ac.uk](mailto:mark.turner@newcastle.ac.uk))  

## Built With

The application uses Strapi to create a role-based middleware app to fetch data from multiple sources. Some are third-party services and others are databases or files included as part of the app. There are third-party Strapi plugins for powering the auto-generation of API documentation and connectivity with [Sentry](https://sentry.io).

[Strapi](https://strapi.io/)   
[Sentry](https://strapi.io/integrations/sentry)   
[Swagger](https://docs.strapi.io/developer-docs/latest/plugins/documentation.html)   
[HubSpot API](https://developers.hubspot.com/docs/api/overview)  
[Clockify API](https://clockify.me/developers-api)  

## Getting Started

### Prerequisites

A local version of NodeJS ([nvm](https://github.com/nvm-sh/nvm) is recommended) between `18.x.x` and `20.x.x`.  

A local [MySQL Community Server](https://dev.mysql.com/downloads/mysql/) running for development. Whilst possible to interact with the database via an interactive shell, it is recommended to use a GUI tool such as [MySQL Workbench](https://dev.mysql.com/downloads/workbench/).

The `.env` file needs to be setup with the database credentials for the connection string, these will be unique to each setup. It is **HIGHLY** recommended not to use the default `root` user and instead generate a new user with only the right level of access to the `rseadmin` schema.

### Installation

Install dependencies

```
npm install
```

### Running Locally

In order to use the admin portal the code needs to be built from source. To do that run

```
npm run build
```

Run with hot reload for development

```
npm run dev
```

Once running, you may need to change the redirect URL that is used after you have authenticated. Strapi gets this value from the database and so, if using a database dump from production, it may redirect you to the production url. To change this, log into the Strapi admin UI, go to Settings > Providers, and edit the Microsoft provider. Change the redirect URL to `http://localhost:3000/auth/login`.

### Testing

There are integration tests against all the API endpoints. These use the [Jest](https://jestjs.io/) and [Supertest](https://github.com/forwardemail/supertest) frameworks. Calls to 3rd party APIs such as Hubspot and Clockify and mocked using the [nock](https://github.com/nock/nock) framework.

To run all the tests
```
npm run test
```

To run tests against a specific API
```
npm run test -- assignments.test.js
```

#### Test Data

The tests use two different sources of test data.

Firstly, there is a SQLite database that contains a post-setup version of Strapi with a small amount of test data in it. This database is mounted for testing purposes and destroyed after all the tests have run. See the files `global-setup.js` and `global-teardown.js` in the `test` folder for this process.

Secondly, the data returned from nock exists as JSON files in the `test/mocks/data` folder. This data is returned by the nock process when intercepting HTTP calls to the 3rd party APIs.

## Deployment

### Local

Deploying to a production style setup but on the local system. The following command builds a Docker container configured with the variables for a production environment with a tag of `latest`.

```
docker build -t rseadmin.azurecr.io/api .
```

### Production

Deployment to production is handled by [GitHub Workflows](https://docs.github.com/en/actions/using-workflows) in the `.github/workflows` directory.

## Usage

Any push to the `dev` branch will trigger a rebuild of the `latest` tag for the Docker image stored in the `rseadmin.azurecr.io` registry. Properly tagged images are generated via releases on the `main` branch and match the version number from the release. For example, a code release of version `1.2.3` will create a Docker image in the registry with name and tag of `rseadmin.azurecr.io/api:1.2.3`.

## Contributing

### Main Branch
Protected and can only be pushed to via pull requests. Should be considered stable and a representation of production code.

### Dev Branch
Should be considered fragile, code should compile and run but features may be prone to errors.

### Feature Branches
A branch per feature being worked on.

https://nvie.com/posts/a-successful-git-branching-model/
