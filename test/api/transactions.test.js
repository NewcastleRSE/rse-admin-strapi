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

describe('Transactions API', () => {

  let transaction

  it('should return 403 if no JWT is provided', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/transactions')
      .set('accept', 'application/json')

    expect(res.status).toBe(403)
  })

  it('should create a new transaction', async () => {

    const res = await request(strapi.server.httpServer)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          costElement: '150090',
          costElementDescription: 'Recharges Inc - Other Dept',
          name: 'RSE support provided on Project Alpha, July',
          documentDate: '2024-08-13',
          value: 4553.52,
          bwCategory: 'Internal Sales',
          documentNumber: '105742452',
          documentHeader: 'Yearly CC cleardown',
          postedDate: '2024-08-14',
          ieCategory: 'Income',
          fiscalYear: 2024,
          fiscalPeriod: 1,
          internalCategory: 'Income'
        }
      })
    
    expect(res.statusCode).toEqual(201)
    expect(res.body.data).toHaveProperty('documentId')
    expect(res.body.data.documentNumber).toBe('105742452')
    transaction = res.body.data
  })

  it('should fetch all transactions', async () => {
    const res = await request(strapi.server.httpServer)
    .get('/api/transactions')
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('should fetch a single transaction', async () => {
    const res = await request(strapi.server.httpServer)
    .get(`/api/transactions/${transaction.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.documentId).toBe(transaction.documentId)
  })

  it('should update a transaction', async () => {
    const res = await request(strapi.server.httpServer)
      .put(`/api/transactions/${transaction.documentId}`)
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          value: 1500000
        }
      })

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.value).toBe(1500000)
  })

  it('should delete a transaction', async () => {
    const res = await request(strapi.server.httpServer)
    .delete(`/api/transactions/${transaction.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(204)

    const fetchRes = await request(strapi.server.httpServer)
    .get(`/api/transactions/${transaction.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(fetchRes.statusCode).toEqual(404)
  })
})