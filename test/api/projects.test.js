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

describe('Projects API', () => {

  let project

  it('should create a new project', async () => {
    const newProject = {
      data: {
        clockifyID: '61f3b79f5bc60c3ad37f522e',
        name: 'Test Project',
        hubspotID: '123456789',
        stage: 'Allocated',
        costModel: 'Directly Incurred',
        awardStage: 'Pre-Award',
        startDate: null,
        endDate: null,
        funder: 'LT',
        school: 'Test School',
        faculty: 'Medical Sciences',
        amount: 1000000,
        value: null,
        financeContact: 'Jane Doe',
        account: null,
        nuProjects: null,
      }
    }

    const res = await request(strapi.server.httpServer)
      .post('/api/projects')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)
      .send(newProject)
      
    expect(res.status).toBe(201)
    expect(res.body.data).toHaveProperty('documentId')
    expect(res.body.data.name).toBe('Test Project')

    project = res.body.data
  })

  it('should return 403 if no JWT is provided', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/projects')
      .set('accept', 'application/json')

    expect(res.status).toBe(403)
  })

  it('should not create a project with missing required fields', async () => {
    const res = await request(strapi.server.httpServer)
      .post('/api/projects')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)
      .send({ data: {} })
    expect(res.status).toBe(400)
  })

  it('should return a list of projects', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/projects')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('should return a single project by documentId', async () => {
    const res = await request(strapi.server.httpServer)
      .get(`/api/projects/${project.documentId}`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(res.status).toBe(200)
    expect(res.body.data.documentId).toBe(project.documentId)
  })

  it('should update a project', async () => {
    const res = await request(strapi.server.httpServer)
      .put(`/api/projects/${project.documentId}`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)
      .send({
        data: {
          name: 'Updated Test Project',
          amount: 2000000
        }
      })

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Updated Test Project')
    expect(res.body.data.amount).toBe(2000000)
  })

  it('should delete a project', async () => {
    const res = await request(strapi.server.httpServer)
      .delete(`/api/projects/${project.documentId}`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(res.status).toBe(204)

    const fetchRes = await request(strapi.server.httpServer)
      .get(`/api/projects/${project.documentId}`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(fetchRes.status).toBe(404)
  })
})
