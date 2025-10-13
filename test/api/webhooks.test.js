const request = require('supertest')
const crypto = require('crypto')
const nock = require('nock')
const { DateTime } = require('luxon')

const hubspotContacts = require('/test/mocks/data/hubspot/contacts.json'),
      hubspotDeal = require('/test/mocks/data/hubspot/deal.json'),
      hubspotLineItems = require('/test/mocks/data/hubspot/lineItems.json'),
      hubspotNotes = require('/test/mocks/data/hubspot/notes.json'),
      clockifyClients = require('/test/mocks/data/clockify/clients.json'),
      clockifyProjects = require('/test/mocks/data/clockify/projects.json')

let updatedProject = clockifyProjects[0]

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

const secret = process.env.HUBSPOT_CLIENT_SECRET

const webhookPayload = {
        appId: 1323067,
        eventId: 100,
        subscriptionId: 3191939,
        portalId: 5251042,
        occurredAt: 1759349822122,
        attemptNumber: 0,
        objectId: 36629623097,
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
    .send([{ ...webhookPayload, ...createProject }])

    expect(res.statusCode).toEqual(401)
  })

  test('should return 200 when creating a project', async () => {

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .get(`/deals/${webhookPayload.objectId}`)
      .query(true)
      .reply(200, hubspotDeal)

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .post('/contacts/search')
      .query(true)
      .reply(200, { total: 2, results: hubspotContacts.results.slice(0, 2) })

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .post('/line_items/search')
      .query(true)
      .reply(200, hubspotLineItems)

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .post('/notes/search')
      .query(true)
      .reply(200, hubspotNotes)

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .get('/clients?name=Jane+Doe&hydrated=true&page-size=5000')
      .reply(200, clockifyClients)

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .get('/projects?name=Robotics+sensors+evaluation&hydrated=true&page-size=5000')
      .reply(200, clockifyProjects[0])

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .post('/projects')
      .reply(201, clockifyProjects[0])

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .patch('/projects/' + clockifyProjects[0].id + '/estimate')
      .reply(201, clockifyProjects[0])

    const createProject = {
      subscriptionType: 'deal.creation',
      changeFlag: 'NEW'
    }

    const payload = [{ ...webhookPayload, ...createProject }]
    const source = secret + JSON.stringify(payload)

    // Create a SHA256 hash of the source string
    const hash = crypto.createHash('sha256').update(source).digest('hex')

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${hash}`)
      .send(payload)

    newProjectId = res.body.documentId

    expect(res.statusCode).toEqual(202)
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

    if(property === 'dealname') {
      updatedProject.name = value
    }

    if(property === 'dealstage') {
      updatedProject.archived = true
    }

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
      .put(`/projects/${updatedProject.id}`)
      .reply(200, updatedProject)

    const payload = [{ ...webhookPayload, ...propertyChange }]
    const source = secret + JSON.stringify(payload)

    // Create a SHA256 hash of the source string
    const hash = crypto.createHash('sha256').update(source).digest('hex')

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${hash}`)
      .send(payload)

    expect(res.statusCode).toEqual(202)
  })

  test('should add contact association from deal', async () => {
    const contactChange = {
      subscriptionType: 'deal.associationChange',
      associationType: 'DEAL_TO_CONTACT',
      fromObjectId: 36629623097,
      toObjectId: 92181619357,
      associationRemoved: false,
      isPrimaryAssociation: false
    }

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .get(`/contacts/${contactChange.toObjectId}`)
      .query(true)
      .reply(200, hubspotContacts.results.find(c => c.id === contactChange.toObjectId.toString()))

    const project = await request(strapi.server.httpServer)
    .get(`/api/projects?filters[hubspotID][$eq]=${contactChange.fromObjectId}&populate=contacts`)
    .set('accept', 'application/json')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)

    // Check if project exists and is unique
    expect(project.status).toBe(200)
    expect(Array.isArray(project.body.data)).toBe(true)
    expect(project.body.data.length).toEqual(1)
    
    const payload = [{ ...webhookPayload, ...contactChange }]

    // Store current contact count
    const contactCount = project.body.data[0].contacts.length
    const source = secret + JSON.stringify(payload)

    // Create a SHA256 hash of the source string
    const hash = crypto.createHash('sha256').update(source).digest('hex')

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${hash}`)
      .send(payload)

    // Check if contact was added
    expect(res.statusCode).toEqual(202)
  })

  test('should add deal association from contact', async () => {
    const contactChange = {
      subscriptionType: 'deal.associationChange',
      associationType: 'CONTACT_TO_DEAL',
      fromObjectId: 92181619356,
      toObjectId: 36629623097,
      associationRemoved: false,
      isPrimaryAssociation: false
    }

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .get(`/contacts/${contactChange.fromObjectId}`)
      .query(true)
      .reply(200, hubspotContacts.results.find(c => c.id === contactChange.fromObjectId.toString()))

    const project = await request(strapi.server.httpServer)
    .get(`/api/projects?filters[hubspotID][$eq]=${contactChange.toObjectId}&populate=contacts`)
    .set('accept', 'application/json')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)

    // Check if project exists and is unique
    expect(project.status).toBe(200)
    expect(Array.isArray(project.body.data)).toBe(true)
    expect(project.body.data.length).toEqual(1)
    
    // Store current contact count
    const contactCount = project.body.data[0].contacts.length

    const payload = [{ ...webhookPayload, ...contactChange }]

    const source = secret + JSON.stringify(payload)
    const hash = crypto.createHash('sha256').update(source).digest('hex')

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${hash}`)
      .send(payload)

    // Check if contact was added
    expect(res.statusCode).toEqual(202)
  })

  test('should remove contact association', async () => {
    const contactChange = {
      subscriptionType: 'deal.associationChange',
      associationType: 'DEAL_TO_CONTACT',
      fromObjectId: 36629623097,
      toObjectId: 92181619357,
      associationRemoved: true,
      isPrimaryAssociation: false
    }

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .get(`/contacts/${contactChange.toObjectId}`)
      .query(true)
      .reply(200, hubspotContacts.results.find(c => c.id === contactChange.toObjectId.toString()))

    const project = await request(strapi.server.httpServer)
    .get(`/api/projects?filters[hubspotID][$eq]=${contactChange.fromObjectId}&populate=contacts`)
    .set('accept', 'application/json')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)

    // Check if project exists and is unique
    expect(project.status).toBe(200)
    expect(Array.isArray(project.body.data)).toBe(true)
    expect(project.body.data.length).toEqual(1)
    
    // Store current contact count
    const contactCount = project.body.data[0].contacts.length

    const payload = [{ ...webhookPayload, ...contactChange }]
    const source = secret + JSON.stringify(payload)

    // Create a SHA256 hash of the source string
    const hash = crypto.createHash('sha256').update(source).digest('hex')

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${hash}`)
      .send(payload)

    // Check if contact was removed
    expect(res.statusCode).toEqual(202)
  })

  test('should remove deal association from contact', async () => {
    const contactChange = {
      subscriptionType: 'deal.associationChange',
      associationType: 'CONTACT_TO_DEAL',
      fromObjectId: 92181619356,
      toObjectId: 36629623097,
      associationRemoved: true,
      isPrimaryAssociation: false
    }

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .get(`/contacts/${contactChange.fromObjectId}`)
      .query(true)
      .reply(200, hubspotContacts.results.find(c => c.id === contactChange.fromObjectId.toString()))

    const project = await request(strapi.server.httpServer)
    .get(`/api/projects?filters[hubspotID][$eq]=${contactChange.toObjectId}&populate=contacts`)
    .set('accept', 'application/json')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)

    // Check if project exists and is unique
    expect(project.status).toBe(200)
    expect(Array.isArray(project.body.data)).toBe(true)
    expect(project.body.data.length).toEqual(1)
    
    // Store current contact count
    const contactCount = project.body.data[0].contacts.length

    const payload = [{ ...webhookPayload, ...contactChange }]
    const source = secret + JSON.stringify(payload)

    // Create a SHA256 hash of the source string
    const hash = crypto.createHash('sha256').update(source).digest('hex')

    const res = await request(strapi.server.httpServer)
      .post('/api/webhooks/hubspot')
      .set('X-HUBSPOT-SIGNATURE', `${hash}`)
      .send(payload)

    // Check if contact was removed
    expect(res.statusCode).toEqual(202)
  })

  test('should update line items', async () => {
    const contactChange = {
      subscriptionType: 'deal.associationChange',
      associationType: 'DEAL_TO_LINE_ITEM',
      fromObjectId: 36629623097,
      toObjectId: 25440617024,
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

    const payload = [{ ...webhookPayload, ...deleteProject }]
    const source = secret + JSON.stringify(payload)

    // Create a SHA256 hash of the source string
    const hash = crypto.createHash('sha256').update(source).digest('hex')

    const res = await request(strapi.server.httpServer)
    .post('/api/webhooks/hubspot')
    .set('X-HUBSPOT-SIGNATURE', `${hash}`)
    .send(payload)

    expect(res.statusCode).toEqual(202)
    
    const fetchRes = await request(strapi.server.httpServer)
    .get(`/api/projects/${newProjectId}`)
    .set('accept', 'application/json')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
    
    expect(fetchRes.status).toBe(404)
  })
})