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

describe('Contacts API', () => {

  let contact

  it('should return 403 if no JWT is provided', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/contacts')
      .set('accept', 'application/json')

    expect(res.status).toBe(403)
  })

  it('should create a new contact', async () => {

    const res = await request(strapi.server.httpServer)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          firstname: 'Jane',
          email: 'jane.doe@example.ac.uk',
          jobTitle: 'Senior Lecturer',
          organisation: null,
          department: 'School X',
          lastname: 'Doe',
          displayName: 'Jane Doe',
          hubspotID: '987654321'
        }
      })
    
    expect(res.statusCode).toEqual(201)
    expect(res.body.data).toHaveProperty('documentId')
    expect(res.body.data.email).toBe('jane.doe@example.ac.uk')
    contact = res.body.data
  })

  it('should fetch all contacts', async () => {
    const res = await request(strapi.server.httpServer)
    .get('/api/contacts')
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('should fetch a single contact', async () => {
    const res = await request(strapi.server.httpServer)
    .get(`/api/contacts/${contact.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.email).toBe(contact.email)
  })

  it('should update a contact', async () => {
    const res = await request(strapi.server.httpServer)
      .put(`/api/contacts/${contact.documentId}`)
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          lastname: 'Smith',
          displayName: 'Jane Smith'
        }
      })

    expect(res.statusCode).toEqual(200)
    expect(res.body.data.lastname).toBe('Smith')
    expect(res.body.data.displayName).toBe('Jane Smith')
  })

  it('should delete a contact', async () => {
    const res = await request(strapi.server.httpServer)
    .delete(`/api/contacts/${contact.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(res.statusCode).toEqual(204)

    const fetchRes = await request(strapi.server.httpServer)
    .get(`/api/contacts/${contact.documentId}`)
    .set('Authorization', `Bearer ${JWT}`)

    expect(fetchRes.statusCode).toEqual(404)
  })
})