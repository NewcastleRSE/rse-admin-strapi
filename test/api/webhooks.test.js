const request = require('supertest')
const nock = require('nock')

const hubspotDeal = require('/test/mocks/data/hubspot/deal.json'),
      hubspotContacts = require('/test/mocks/data/hubspot/dealContacts.json'),
      hubspotLineItems = require('/test/mocks/data/hubspot/dealLineItems.json'),
      hubspotNotes = require('/test/mocks/data/hubspot/dealNotes.json')

afterEach(() => {
  nock.cleanAll()
})

afterAll(() => {
  nock.restore()
})

describe('Webhooks API', () => {

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

    console.log(hubspotContacts)

    nock(`https://api.hubapi.com/crm/v3/objects`)
      .get('/deals/29467931466')
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

    const res = await request(strapi.server.httpServer)
    .post('/api/webhooks/hubspot')
    .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
    .send({
      "appId": 1323067,
      "eventId": 100,
      "subscriptionId": 3191939,
      "portalId": 5251042,
      "occurredAt": 1759349822122,
      "subscriptionType": "deal.creation",
      "attemptNumber": 0,
      "objectId": 29467931466,
      "changeSource": "CRM",
      "changeFlag": "NEW"
    })

    console.log(res.body)

    expect(res.statusCode).toEqual(200)
  })

  // test('should update a project', async () => {
  //   const res = await request(strapi.server.httpServer)
  //   .post('/webhooks/hubspot')
  //   .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
  //   .send({
  //     "appId": 1323067,
  //     "eventId": 100,
  //     "subscriptionId": 3126292,
  //     "portalId": 5251042,
  //     "occurredAt": 1759350032444,
  //     "subscriptionType": "deal.propertyChange",
  //     "attemptNumber": 0,
  //     "objectId": 123,
  //     "changeSource": "CRM",
  //     "propertyName": "funding_body",
  //     "propertyValue": "sample-value"
  //   })

  //   expect(res.statusCode).toEqual(200)
  // })

  // test('should archive a project', async () => {
  //   const res = await request(strapi.server.httpServer)
  //   .post('/webhooks/hubspot')
  //   .set('Authorization', `Bearer ${process.env.ACCESS_TOKEN}`)
  //   .send({
  //     "appId": 1323067,
  //     "eventId": 100,
  //     "subscriptionId": 3191937,
  //     "portalId": 5251042,
  //     "occurredAt": 1759349997934,
  //     "subscriptionType": "deal.deletion",
  //     "attemptNumber": 0,
  //     "objectId": 123,
  //     "changeSource": "CRM",
  //     "changeFlag": "DELETED"
  //   })

  //   expect(res.statusCode).toEqual(200)
  // })
})