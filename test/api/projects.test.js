const request = require('supertest')
const nock = require('nock')

const hubspotDeals = require('/test/mocks/data/hubspot/deals.json')
const hubspotAssociations = require('/test/mocks/data/hubspot/associations.json')
const hubspotContacts = require('/test/mocks/data/hubspot/contacts.json')

const clockifyClients = require('/test/mocks/data/clockify/clients.json')
const clockifyProjects = require('/test/mocks/data/clockify/clockify-projects.json')

let JWT

beforeAll(async () => {
  await request(strapi.server.httpServer)
        .post('/api/auth/local')
        .set('accept', 'application/json')
        .set('Content-Type', 'application/json')
        .send({
          identifier: 'tester@strapi.com',
          password: '1234abcd',
        })
        .then((data) => {
          JWT = data.body.jwt
        })
})

afterEach(() => {
  nock.cleanAll()
})

afterAll(() => {
  nock.restore()
})

describe('Projects API', () => {

  let project

  it('should create a new project', async () => {
    const newProject = {
      data: {
        clockifyID: '61f3b79f5bc60c3ad37f522e',
        name: 'Test Project',
        hubspotID: '123456789',
        stage: 'Allocated',
        costModel: 'Directly Incurred',
        awardStage: 'Pre-Award',
        startDate: null,
        endDate: null,
        funder: 'LT',
        school: 'Test School',
        faculty: 'Medical Sciences',
        amount: 1000000,
        value: null,
        financeContact: 'Jane Doe',
        account: null,
        nuProjects: null,
      }
    }

    const res = await request(strapi.server.httpServer)
      .post('/api/projects')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)
      .send(newProject)
      
    expect(res.status).toBe(201)
    expect(res.body.data).toHaveProperty('documentId')
    expect(res.body.data.name).toBe('Test Project')

    project = res.body.data
  })

  it('should return 403 if no JWT is provided', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/projects')
      .set('accept', 'application/json')

    expect(res.status).toBe(403)
  })

  it('should not create a project with missing required fields', async () => {
    const res = await request(strapi.server.httpServer)
      .post('/api/projects')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)
      .send({ data: {} })
    expect(res.status).toBe(400)
  })

  it('should return a list of projects', async () => {

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .get('/projects?hydrated=true&page-size=5000')
      .reply(200, clockifyProjects)

    const res = await request(strapi.server.httpServer)
      .get('/api/projects')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)
      .expect(200)

    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('should return a single project by documentId', async () => {
    const res = await request(strapi.server.httpServer)
      .get(`/api/projects/${project.documentId}`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(res.status).toBe(200)
    expect(res.body.data.documentId).toBe(project.documentId)
  })

  it('should update a project', async () => {
    const res = await request(strapi.server.httpServer)
      .put(`/api/projects/${project.documentId}`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          name: 'Updated Test Project',
          amount: 2000000
        }
      })

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Updated Test Project')
    expect(res.body.data.amount).toBe(2000000)
  })

  it('should delete a project', async () => {
    const res = await request(strapi.server.httpServer)
      .delete(`/api/projects/${project.documentId}`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(res.status).toBe(204)

    const fetchRes = await request(strapi.server.httpServer)
      .get(`/api/projects/${project.documentId}`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(fetchRes.status).toBe(404)
  })

  it('should sync projects from Hubspot', async () => {

    nock(`https://api.hubapi.com/crm/v3/objects/deals`)
          .post(`/search`)
          .query(true)
          .reply(200, hubspotDeals)

    nock(`https://api.hubapi.com/crm/v3/associations/deals/contacts/batch`)
          .post(`/read`)
          .query(true)
          .reply(200, hubspotAssociations)

    nock(`https://api.hubapi.com/crm/v3/objects/contacts`)
          .post(`/search`)
          .query(true)
          .reply(200, hubspotContacts)

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
          .get('/clients?page-size=5000')
          .reply(200, clockifyClients)

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
          .get('/projects?page-size=5000')
          .reply(200, clockifyProjects)

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .persist()
      .put(/projects\/[^\/]+$/)
      .reply(200, clockifyProjects[0]) // Return first project as updated project

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .persist()
      .post('/projects')
      .reply(200, clockifyProjects[0]) // Return first project as created project

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .persist()
      .delete(/projects\/[^\/]+$/)
      .reply(200, clockifyProjects[0]) // Return first project as deleted project

    // Mock deletion of unused clients
    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .persist()
      .delete(/clients\/[^\/]+$/)
      .reply(200, clockifyClients[0]) // Return first client as deleted client

    // Mock update of clients
    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .persist()
      .put(/clients\/[^\/]+$/)
      .reply(200, clockifyClients[0]) // Return first client as updated client

    // Mock creation of clients
    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .persist()
      .post(`/clients`)
      .reply(201, clockifyClients[0]) // Return first client as created client

    const res = await request(strapi.server.httpServer)
      .get('/api/projects/sync')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    //console.log(JSON.stringify(res.body, null, 2))

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('created')
    expect(res.body).toHaveProperty('updated')
    expect(res.body).toHaveProperty('errors')
    expect(Array.isArray(res.body.created)).toBe(true)
    expect(Array.isArray(res.body.updated)).toBe(true)
    expect(Array.isArray(res.body.errors)).toBe(true)
  }, 3000000)
})
