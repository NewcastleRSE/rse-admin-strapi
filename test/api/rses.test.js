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

    const fetchRes = await request(strapi.server.httpServer)
    .get(`/api/rses/${rse.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(fetchRes.statusCode).toEqual(404)
  })
})