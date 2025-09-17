const request = require('supertest')

it('Strapi is defined', async () => {
  expect(strapi).toBeDefined()
})

describe('User Authentication', () => {

  const mockUserData = {
    username: "tester",
    email: "tester@strapi.com",
    provider: "local",
    password: "1234abcd",
    confirmed: true,
    blocked: null,
  }

  let JWT

  it("should login user and return jwt token", async () => {

    await request(strapi.server.httpServer)
      .post("/api/auth/local")
      .set("accept", "application/json")
      .set("Content-Type", "application/json")
      .send({
        identifier: mockUserData.email,
        password: mockUserData.password,
      })
      .expect("Content-Type", /json/)
      .expect(200)
      .then((data) => {

        JWT = data.body.jwt

        expect(data.body.user).toBeDefined()
        expect(data.body.user.username).toBe(mockUserData.username)
        expect(data.body.user.email).toBe(mockUserData.email)
        expect(data.body.user.password).toBeUndefined()
        expect(data.body.user.provider).toBe(mockUserData.provider)
        expect(data.body.jwt).toBeDefined()
      })
  })

  it('should return user profile with valid JWT', async () => {
      await request(strapi.server.httpServer)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${JWT}`)
        .expect(200)
        .then((data) => {
          expect(data.body).toBeDefined()
          expect(data.body.id).toBeDefined()
          expect(data.body.documentId).toBeDefined()
          expect(data.body.username).toBe(mockUserData.username)
          expect(data.body.email).toBe(mockUserData.email)
          expect(data.body.password).toBeUndefined()
          expect(data.body.provider).toBe(mockUserData.provider)
        })
    })

})