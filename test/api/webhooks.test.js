const request = require('supertest')
const nock = require('nock')

const hubspotDeal = require('/test/mocks/data/hubspot/deal.json'),
      hubspotContacts = require('/test/mocks/data/hubspot/dealContacts.json'),
      hubspotLineItems = require('/test/mocks/data/hubspot/dealLineItems.json'),
      hubspotNotes = require('/test/mocks/data/hubspot/dealNotes.json'),
      clockifyClients = require('/test/mocks/data/clockify/clients.json'),
      clockifyProject = require('/test/mocks/data/clockify/project.json')

afterEach(() => {
  nock.cleanAll()
})

afterAll(() => {
  nock.restore()
})

describe('Webhooks API', () => {

  let newProjectId

  test('should return 403 without auth', async () => {
    const res = await request(strapi.server.httpServer)
    .post('/api/webhooks/hubspot')
    .send({
      "appId": 1323067,
      "eventId": 100,
      "subscriptionId": 3191939,
      "portalId": 5251042,
      "occurredAt": 1759349822122,
      "subscriptionType": "deal.creation",
      "attemptNumber": 0,
      "objectId": 123,
      "changeSource": "CRM",
      "changeFlag": "NEW"
    })

    expect(res.statusCode).toEqual(403)
  })

  test('should return 201 when creating a project', async () => {

    const webhookPayload = {
        appId: 1323067,
        eventId: 100,
        subscriptionId: 3191939,
        portalId: 5251042,
        occurredAt: 1759349822122,
        subscriptionType: 'deal.creation',
        attemptNumber: 0,
        objectId: 29467931466,
        changeSource: 'CRM',
        changeFlag: 'NEW'
      }

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .get(`/deals/${webhookPayload.objectId}`)
      .query(true)
      .reply(200, hubspotDeal)

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .post('/contacts/search')
      .query(true)
      .reply(200, hubspotContacts)

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .post('/line_items/search')
      .query(true)
      .reply(200, hubspotLineItems)

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .post('/notes/search')
      .query(true)
      .reply(200, hubspotNotes)

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .get('/clients?name=Adam+Ingram&hydrated=true&page-size=5000')
      .reply(200, clockifyClients)

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .get('/projects?name=X-ray+Measurements+of+Accreting+black+holes+with+Polarimetric-Spectral-timing+techniques+(X-MAPS)&hydrated=true&page-size=5000')
      .reply(200, clockifyProject)

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .post('/projects')
      .reply(201, clockifyProject[0])

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
      .send(webhookPayload)

    newProjectId = res.body.documentId

    expect(res.statusCode).toEqual(201)
    expect(res.body).toHaveProperty('documentId')
    expect(res.body).toHaveProperty('clockifyID')
    expect(res.body).toHaveProperty('hubspotID', webhookPayload.objectId.toString())
    expect(res.body).toHaveProperty('name', 'X-ray Measurements of Accreting black holes with Polarimetric-Spectral-timing techniques (X-MAPS)')
  })

  test('should update an existing project', async () => {

    const webhookPayload = {
      appId: 1323067,
      eventId: 100,
      subscriptionId: 3126292,
      portalId: 5251042,
      occurredAt: 1759350032444,
      subscriptionType: 'deal.propertyChange',
      attemptNumber: 0,
      objectId: 29467931466,
      changeSource: 'CRM',
      propertyName: 'funding_body',
      propertyValue: 'EPSRC'
    }

    const res = await request(strapi.server.httpServer)
    .post('/api/webhooks/hubspot')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
    .send(webhookPayload)

    expect(res.statusCode).toEqual(200)
    expect(res.body).toHaveProperty('documentId')
    expect(res.body).toHaveProperty('clockifyID')
    expect(res.body).toHaveProperty('hubspotID', webhookPayload.objectId.toString())
    expect(res.body).toHaveProperty('funder', 'EPSRC')
  })

  test('should archive a project', async () => {

const webhookPayload = {
      "appId": 1323067,
      "eventId": 100,
      "subscriptionId": 3191937,
      "portalId": 5251042,
      "occurredAt": 1759349997934,
      "subscriptionType": "deal.deletion",
      "attemptNumber": 0,
      "objectId": 29467931466,
      "changeSource": "CRM",
      "changeFlag": "DELETED"
    }

    const res = await request(strapi.server.httpServer)
    .post('/api/webhooks/hubspot')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
    .send(webhookPayload)

    expect(res.statusCode).toEqual(204)
    
    const fetchRes = await request(strapi.server.httpServer)
    .get(`/api/projects/${newProjectId}`)
    .set('accept', 'application/json')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
    
    expect(fetchRes.status).toBe(404)
  })
})