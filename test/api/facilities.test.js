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

describe('Facilities API', () => {

  let facility

  it('should return 403 if no JWT is provided', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/facilities')
      .set('accept', 'application/json')

    expect(res.status).toBe(403)
  })

  it('should create a new facility', async () => {

    const res = await request(strapi.server.httpServer)
      .post('/api/facilities')
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          year: 2022,
          nonSalaryCosts: 100000,
          estatesCosts: 50000,
          dayRate: 450,
          utilisationRate: 0.75,
          incomeTarget: 1000000
        }
      })
    
    expect(res.statusCode).toEqual(201)
    expect(res.body.data).toHaveProperty('id')
    expect(res.body.data.year).toBe(2022)
    facility = res.body.data
  })

  it('should fetch all facilities', async () => {
    const res = await request(strapi.server.httpServer)
    .get('/api/facilities')
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('should fetch a single facility', async () => {
    const res = await request(strapi.server.httpServer)
    .get(`/api/facilities/${facility.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.documentId).toBe(facility.documentId)
  })

  it('should update a facility', async () => {
    const res = await request(strapi.server.httpServer)
      .put(`/api/facilities/${facility.documentId}`)
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          incomeTarget: 1500000
        }
      })

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.incomeTarget).toBe(1500000)
  })

  it('should delete a facility', async () => {
    const res = await request(strapi.server.httpServer)
    .delete(`/api/facilities/${facility.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(204)

    const fetchRes = await request(strapi.server.httpServer)
    .get(`/api/facilities/${facility.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(fetchRes.statusCode).toEqual(404)
  })
})