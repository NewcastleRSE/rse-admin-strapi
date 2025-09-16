const fs = require('fs')
const { setupStrapi, cleanupStrapi } = require('./strapi')
const request = require('supertest')

let JWT

beforeAll(async () => {
  await setupStrapi()
})

afterAll(async () => {
  await cleanupStrapi()
})

it('Strapi is defined', async () => {
  expect(strapi).toBeDefined()
})

describe('User Registration and Authentication', () => {

  const mockUserData = {
    username: "tester",
    email: "tester@strapi.com",
    provider: "local",
    password: "1234abc",
    confirmed: true,
    blocked: null,
  }

  it("should register user and return jwt token", async () => {

    await request(strapi.server.httpServer) // app server is an instance of Class: http.Server
      .post("/api/auth/local/register")
      .set("accept", "application/json")
      .set("Content-Type", "application/json")
      .send({
        username: mockUserData.username,
        email: mockUserData.email,
        password: mockUserData.password
      })
      .expect("Content-Type", /json/)
      .expect(200)
      .then((data) => {
        expect(data.body.jwt).toBeDefined()
        JWT = data.body.jwt
      })
  })

  it("should login user and return jwt token", async () => {

    await request(strapi.server.httpServer) // app server is an instance of Class: http.Server
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
        expect(data.body.jwt).toBeDefined()
      })
  })

})

require('./api/facilities.test.js')(JWT)