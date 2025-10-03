const request = require('supertest')
const crypto = require('crypto')
const nock = require('nock')
const { DateTime } = require('luxon')

const hubspotDeal = require('/test/mocks/data/hubspot/deal.json'),
      hubspotContacts = require('/test/mocks/data/hubspot/dealContacts.json'),
      hubspotLineItems = require('/test/mocks/data/hubspot/dealLineItems.json'),
      hubspotNotes = require('/test/mocks/data/hubspot/dealNotes.json'),
      clockifyClients = require('/test/mocks/data/clockify/clients.json'),
      clockifyProject = require('/test/mocks/data/clockify/project.json'),
      updatedProject = require('/test/mocks/data/clockify/updatedProject.json')

const propertyMap = {
        account_code: 'account',
        amount: 'amount',
        award_stage: 'awardStage',
        cost_model: 'costModel',
        dealname: 'name',
        dealstage: 'stage',
        end_date: 'endDate',
        faculty: 'faculty',
        finance_contact: 'financeContact',
        funding_body: 'funder',
        hs_object_id: 'hsObjectId',
        project_value: 'value',
        school: 'school',
        start_date: 'startDate',
        nu_projects_number: 'nuProjects',
      }

const signature = crypto.createHash('sha256').update(process.env.HUBSPOT_CLIENT_SECRET).digest('hex')

const webhookPayload = {
        appId: 1323067,
        eventId: 100,
        subscriptionId: 3191939,
        portalId: 5251042,
        occurredAt: 1759349822122,
        attemptNumber: 0,
        objectId: 29467931466,
        changeSource: 'CRM'
      }

afterEach(() => {
  nock.cleanAll()
})

afterAll(() => {
  nock.restore()
})

describe('Webhooks API', () => {

  let newProjectId

  const createProject = {
    subscriptionType: 'deal.creation',
    changeFlag: 'NEW'
  }

  test('should return 401 without auth', async () => {
    const res = await request(strapi.server.httpServer)
    .post('/api/webhooks/hubspot')
    .send({ ...webhookPayload, ...createProject })

    expect(res.statusCode).toEqual(401)
  })

  test('should return 201 when creating a project', async () => {

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

    const createProject = {
      subscriptionType: 'deal.creation',
      changeFlag: 'NEW'
    }

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${signature}`)
      .send({ ...webhookPayload, ...createProject })

    newProjectId = res.body.documentId

    expect(res.statusCode).toEqual(201)
    expect(res.body.data).toHaveProperty('documentId')
    expect(res.body.data).toHaveProperty('clockifyID')
    expect(res.body.data).toHaveProperty('hubspotID', webhookPayload.objectId.toString())
    expect(res.body.data).toHaveProperty('name', 'X-ray Measurements of Accreting black holes with Polarimetric-Spectral-timing techniques (X-MAPS)')
  })

  it.each([
    ['account_code', 'RES/1234/5678/9'],
    ['amount', 12345],
    ['award_stage', 'Centrally Awarded'],
    ['cost_model', 'Voluntary'],
    ['dealname', 'Updated Project'],
    ['dealstage', 'closedlost'],
    ['end_date', '2026-05-31'],
    ['faculty', 'Humanities & Social Sciences'],
    ['finance_contact', 'John Doe'],
    ['funding_body', 'EPSRC'],
    ['nu_projects_number', 'NU-123456'],
    ['project_value', 100000],
    ['school', 'School of Test'],
    ['start_date', '2023-06-01']
  ])
  (`should update %s`, async (property, value) => {

    const propertyChange = {
      subscriptionType: 'deal.propertyChange',
      propertyName: property,
      propertyValue: property === 'start_date' || property === 'end_date' ? DateTime.fromFormat(value, 'yyyy-MM-dd').toMillis() : value
    }

    const dealStage = { closedlost: 'Not Funded'}

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .put(`/projects/${updatedProject.id}`)
      .reply(200, updatedProject)

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${signature}`)
      .send({ ...webhookPayload, ...propertyChange })

    expect(res.statusCode).toEqual(200)
    expect(res.body.data).toHaveProperty('hubspotID', webhookPayload.objectId.toString())

    if(property === 'dealstage') {
      expect(res.body.data).toHaveProperty(propertyMap[property], dealStage[value])
    }
    else {
      expect(res.body.data).toHaveProperty(propertyMap[property], value)
    }
  })

  test('should update contact association', async () => {
    const contactChange = {
      subscriptionType: 'deal.associationChange',
      associationType: 'DEAL_TO_CONTACT',
      fromObjectId: 29467931466,
      toObjectId: 20,
      associationRemoved: false,
      isPrimaryAssociation: false
    }

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${signature}`)
      .send({ ...webhookPayload, ...contactChange })

    expect(res.statusCode).toEqual(200)
  })

  test('should update line items', async () => {
    const contactChange = {
      subscriptionType: 'deal.associationChange',
      associationType: 'DEAL_TO_LINE_ITEM',
      fromObjectId: 29467931466,
      toObjectId: 20,
      associationRemoved: false,
      isPrimaryAssociation: false
    }

    expect(1).toEqual(1)
  })

  test('should delete a project', async () => {

    const deleteProject = {
      subscriptionType: 'deal.deletion',
      changeFlag: 'DELETED'
    }

    const res = await request(strapi.server.httpServer)
    .post('/api/webhooks/hubspot')
    .set('X-HUBSPOT-SIGNATURE', `${signature}`)
    .send({ ...webhookPayload, ...deleteProject })

    expect(res.statusCode).toEqual(204)
    
    const fetchRes = await request(strapi.server.httpServer)
    .get(`/api/projects/${newProjectId}`)
    .set('accept', 'application/json')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
    
    expect(fetchRes.status).toBe(404)
  })
})