const request = require('supertest')
const nock = require('nock')

let JWT, projects, rses

beforeAll(async () => {

    const clockifyProjects = require('/test/mocks/data/clockify/projects.json')

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

    nock(`https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`)
        .get('/projects?hydrated=true&page-size=5000')
        .reply(200, clockifyProjects)

    projects = await request(strapi.server.httpServer)
        .get('/api/projects')
        .set('Authorization', `Bearer ${JWT}`)
        .then((data) => {
          return data.body.data
        })

    rses = await request(strapi.server.httpServer)
        .get('/api/rses')
        .set('Authorization', `Bearer ${JWT}`)
        .then((data) => {
          return data.body.data
        })
})

describe('Assignments API', () => {
    let assignmentId, assignmentPayload

    it('should return 403 if no JWT is provided', async () => {
        const res = await request(strapi.server.httpServer)
          .get('/api/assignments')
          .set('accept', 'application/json')
    
        expect(res.status).toBe(403)
    })

    it('should create a new assignment', async () => {

        // Example assignment payload
        assignmentPayload = {
            fte: 50,
            start: '2023-10-01',
            end: '2025-12-31',
            project: projects[0].documentId,
            rse: rses[0].documentId,
            rate: 'senior'
        }

        const res = await request(strapi.server.httpServer)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${JWT}`)
            .send({ data: assignmentPayload })
            .expect(201)

        expect(res.body.data).toHaveProperty('documentId')
        expect(res.body.data.fte).toBe(assignmentPayload.fte)
        expect(res.body.data.start).toBe(assignmentPayload.start)
        expect(res.body.data.end).toBe(assignmentPayload.end)
        expect(res.body.data.rate).toBe(assignmentPayload.rate)

        assignmentId = res.body.data.documentId
    })

    it('should create a new assignment with standard rate selected if nothing supplied', async () => {

        // Example assignment payload
        assignmentPayload = {
            fte: 50,
            start: '2023-10-01',
            end: '2025-12-31',
            project: projects[0].documentId,
            rse: rses[0].documentId
        }

        const res = await request(strapi.server.httpServer)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${JWT}`)
            .send({ data: assignmentPayload })
            .expect(201)

        expect(res.body.data).toHaveProperty('documentId')
        expect(res.body.data.fte).toBe(assignmentPayload.fte)
        expect(res.body.data.start).toBe(assignmentPayload.start)
        expect(res.body.data.end).toBe(assignmentPayload.end)
        expect(res.body.data.rate).toBe('standard')

        assignmentId = res.body.data.documentId
    })

    it('should get all assignments', async () => {
        const res = await request(strapi.server.httpServer)
            .get('/api/assignments')
          .set('Authorization', `Bearer ${JWT}`)
            .expect(200)

        expect(Array.isArray(res.body.data)).toBe(true)
        expect(res.body.data.some(a => a.documentId === assignmentId)).toBe(true)
    })

    it('should get a single assignment by documentId', async () => {
        const res = await request(strapi.server.httpServer)
            .get(`/api/assignments/${assignmentId}`)
            .set('Authorization', `Bearer ${JWT}`)
            .expect(200)

        expect(res.body.data).toHaveProperty('documentId', assignmentId)
        expect(res.body.data.fte).toBe(assignmentPayload.fte)
        expect(res.body.data.start).toBe(assignmentPayload.start)
        expect(res.body.data.end).toBe(assignmentPayload.end)
    })

    it('should update an assignment', async () => {
        const updatedPayload = { ...assignmentPayload, fte: 100 };
        const res = await request(strapi.server.httpServer)
            .put(`/api/assignments/${assignmentId}`)
            .set('Authorization', `Bearer ${JWT}`)
            .send({data: updatedPayload})
            .expect(200)

        expect(res.body.data).toHaveProperty('documentId', assignmentId);
        expect(res.body.data.fte).toBe(100);
    })

    it('should delete an assignment', async () => {
        await request(strapi.server.httpServer)
            .delete(`/api/assignments/${assignmentId}`)
            .set('Authorization', `Bearer ${JWT}`)
            .expect(204)

        await request(strapi.server.httpServer)
            .get(`/api/assignments/${assignmentId}`)
            .set('Authorization', `Bearer ${JWT}`)
            .expect(404)
    })

    it('should return 400 for invalid assignment creation', async () => {
        const res = await request(strapi.server.httpServer)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${JWT}`)
            .send({data: {}})
            .expect(400);

        expect(res.body).toHaveProperty('error')
    })

    it('should return 404 for non-existent assignment', async () => {
        await request(strapi.server.httpServer)
            .get('/api/assignments/999999')
            .set('Authorization', `Bearer ${JWT}`)
            .expect(404)
    })
})