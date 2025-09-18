const request = require('supertest')

let JWT, rses

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

    rses = await request(strapi.server.httpServer)
        .get('/api/rses')
        .set('Authorization', `Bearer ${JWT}`)
        .then((data) => {
          return data.body.data
        })
})

describe('Capacity API', () => {
    let capacityId, capacityPayload

    it('should return 403 if no JWT is provided', async () => {
        const res = await request(strapi.server.httpServer)
          .get('/api/capacities')
          .set('accept', 'application/json')
    
        expect(res.status).toBe(403)
    })

    it('should create a new capacity', async () => {

        // Example capacity payload
        capacityPayload = {
            capacity: 50,
            start: '2023-10-01',
            end: '2025-12-31',
            rse: rses[0].documentId
        }

        const res = await request(strapi.server.httpServer)
            .post('/api/capacities')
            .set('Authorization', `Bearer ${JWT}`)
            .send({ data: capacityPayload })
            .expect(201)

        expect(res.body.data).toHaveProperty('documentId')
        expect(res.body.data.capacity).toBe(capacityPayload.capacity)
        expect(res.body.data.start).toBe(capacityPayload.start)
        expect(res.body.data.end).toBe(capacityPayload.end)

        capacityId = res.body.data.documentId
    })

    it('should get all capacities', async () => {
        const res = await request(strapi.server.httpServer)
            .get('/api/capacities')
          .set('Authorization', `Bearer ${JWT}`)
            .expect(200)

        expect(Array.isArray(res.body.data)).toBe(true)
        expect(res.body.data.some(a => a.documentId === capacityId)).toBe(true)
    })

    it('should get a single capacity by documentId', async () => {
        const res = await request(strapi.server.httpServer)
            .get(`/api/capacities/${capacityId}`)
            .set('Authorization', `Bearer ${JWT}`)
            .expect(200)

        expect(res.body.data).toHaveProperty('documentId', capacityId)
        expect(res.body.data.capacity).toBe(capacityPayload.capacity)
        expect(res.body.data.start).toBe(capacityPayload.start)
        expect(res.body.data.end).toBe(capacityPayload.end)
    })

    it('should update an capacity', async () => {
        const updatedPayload = { ...capacityPayload, capacity: 100 };
        const res = await request(strapi.server.httpServer)
            .put(`/api/capacities/${capacityId}`)
            .set('Authorization', `Bearer ${JWT}`)
            .send({data: updatedPayload})
            .expect(200)

        expect(res.body.data).toHaveProperty('documentId', capacityId);
        expect(res.body.data.capacity).toBe(100);
    })

    it('should delete an capacity', async () => {
        await request(strapi.server.httpServer)
            .delete(`/api/capacities/${capacityId}`)
            .set('Authorization', `Bearer ${JWT}`)
            .expect(204)

        await request(strapi.server.httpServer)
            .get(`/api/capacities/${capacityId}`)
            .set('Authorization', `Bearer ${JWT}`)
            .expect(404)
    })

    it('should return 400 for invalid capacity creation', async () => {
        const res = await request(strapi.server.httpServer)
            .post('/api/capacities')
            .set('Authorization', `Bearer ${JWT}`)
            .send({data: {}})
            .expect(400);

        expect(res.body).toHaveProperty('error')
    })

    it('should return 404 for non-existent capacity', async () => {
        await request(strapi.server.httpServer)
            .get('/api/capacities/999999')
            .set('Authorization', `Bearer ${JWT}`)
            .expect(404)
    })
})