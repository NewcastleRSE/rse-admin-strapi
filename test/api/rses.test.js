const request = require('supertest')

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

describe('Rses API', () => {

  let rse

  it('should return 403 if no JWT is provided', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/rses')
      .set('accept', 'application/json')

    expect(res.status).toBe(403)
  })

  it('should create a new rse', async () => {

    const res = await request(strapi.server.httpServer)
      .post('/api/rses')
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          "firstname": "Christopher",
          "lastname": "Butler",
          "email": "christopher.butler@example.com",
          "contractStart": "2025-08-15",
          "personnelNumber": "1006",
          "team": "DataScience",
          "active": true,
          "clockifyID": "5f8f8c8c8c8c8c8c8c8c8c9b",
          "github": "cbutler",
          "username": "cbutler",
          "displayName": "Christopher Butler"
        },
      })
    
    expect(res.statusCode).toEqual(201)
    expect(res.body.data).toHaveProperty('documentId')
    expect(res.body.data.email).toBe('christopher.butler@example.com')
    rse = res.body.data
  })

  it('should fetch all rses', async () => {
    const res = await request(strapi.server.httpServer)
    .get('/api/rses')
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('should fetch a single rse', async () => {

    const res = await request(strapi.server.httpServer)
    .get(`/api/rses/${rse.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.email).toBe(rse.email)
    expect(res.body.data).not.toHaveProperty('assignments')
    expect(res.body.data).not.toHaveProperty('capacities')
  })

  it('should fetch an rse with their assignments and capacities', async () => {

    const populate = 'populate[0]=assignments&populate[1]=capacities'
    const filters = 'filters[$and][0][contractStart][$lt]=2026-07-31&filters[$and][1][capacities][$or][0][end][$between][0]=2025-08-01&filters[$and][1][capacities][$or][0][end][$between][1]=2026-07-31&filters[$and][1][capacities][$or][1][end][$null]=true'
    // RSE present in seed database
    const existingRse = {
      documentId: 'jwo6u5uil5wbvqh76dxp1kq0',
      email: 'sofia.rossi@example.com'
    }

    const res = await request(strapi.server.httpServer)
    .get(`/api/rses/${existingRse.documentId}?pagination[page]=0&pagination[pageSize]=100&${filters}&${populate}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.email).toBe(existingRse.email)
    expect(res.body.data).toHaveProperty('assignments')
    expect(res.body.data).toHaveProperty('capacities')
    expect(Array.isArray(res.body.data.assignments)).toBe(true)
    expect(Array.isArray(res.body.data.capacities)).toBe(true)
    expect(res.body.data.assignments.length).toBeGreaterThan(0)
    expect(res.body.data.capacities.length).toBeGreaterThan(0)
  })

  it('should update a rse', async () => {
    const res = await request(strapi.server.httpServer)
      .put(`/api/rses/${rse.documentId}`)
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          lastname: 'Smith',
          displayName: 'Christopher Smith'
        }
      })

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.lastname).toBe('Smith')
    expect(res.body.data.displayName).toBe('Christopher Smith')
  })

  it('should delete a rse', async () => {
    const res = await request(strapi.server.httpServer)
    .delete(`/api/rses/${rse.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(204)

    // const fetchRes = await request(strapi.server.httpServer)
    // .get(`/api/rses/${rse.documentId}`)
    // .set('Authorization', `Bearer ${JWT}`)

    // expect(fetchRes.statusCode).toEqual(404)
  })
})