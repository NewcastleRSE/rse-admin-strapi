const request = require('supertest')
const nock = require('nock')
const clockifyProjects = require('/test/mocks/data/clockify/projects.json')
const clockifySummary = require('/test/mocks/data/clockify/reports/summary.json')
const hubspotProducts = require('/test/mocks/data/hubspot/products.json')

let JWT, projects

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

  nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
          .get('/projects?hydrated=true&page-size=5000')
          .reply(200, clockifyProjects)
  
      projects = await request(strapi.server.httpServer)
          .get('/api/projects')
          .set('Authorization', `Bearer ${JWT}`)
          .then((data) => {
            return data.body.data
          })
})

afterEach(() => {
  nock.cleanAll()
})

afterAll(() => {
  nock.restore()
})

describe('Invoices API', () => {

  let invoice

  it('should return 403 if no JWT is provided', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/invoices')
      .set('accept', 'application/json')

    expect(res.status).toBe(403)
  })

  it('should create a new invoice', async () => {

    nock(`https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports`)
          .post('/summary')
          .reply(200, clockifySummary)

    nock(`https://api.hubapi.com/crm/v3/objects/products`)
          .post('/search')
          .reply(200, hubspotProducts)

    const res = await request(strapi.server.httpServer)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          project: projects[0].documentId,
          year: 2025,
          month: 'august'
        }
      })
    
    expect(res.statusCode).toEqual(201)
    expect(res.body.data).toHaveProperty('documentId')
    expect(res.body.data.month).toBe('august')
    expect(res.body.data.standard_price).toBe(416.32)
    expect(res.body.data.senior_price).toBe(483.92)
    invoice = res.body.data
  })

  it('should fetch all invoices', async () => {
    const res = await request(strapi.server.httpServer)
    .get('/api/invoices')
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('should fetch a single invoice', async () => {
    const res = await request(strapi.server.httpServer)
    .get(`/api/invoices/${invoice.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.email).toBe(invoice.email)
  })

  it('should update a invoice', async () => {
    const res = await request(strapi.server.httpServer)
      .put(`/api/invoices/${invoice.documentId}`)
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          year: 2024,
          month: 'july'
        }
      })

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.year).toBe(2024)
    expect(res.body.data.month).toBe('july')
  })

  it('should delete a invoice', async () => {
    const res = await request(strapi.server.httpServer)
    .delete(`/api/invoices/${invoice.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(204)

    const fetchRes = await request(strapi.server.httpServer)
    .get(`/api/invoices/${invoice.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(fetchRes.statusCode).toEqual(404)
  })
})