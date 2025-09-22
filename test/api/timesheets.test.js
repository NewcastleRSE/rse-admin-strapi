const request = require('supertest')
const nock = require('nock')
const { DateTime, Interval } = require('luxon')

const clockifyDetailed = require('/test/mocks/data/clockifyDetailed.json')
const clockifyDetailedUser = require('/test/mocks/data/clockifyDetailedUser.json')
const leaveEntries = require('/test/mocks/data/leaveEntries.json')
const bankHolidays = require('/test/mocks/data/bankHolidays.json')

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

afterEach(() => {
  nock.cleanAll()
})

afterAll(() => {
  nock.restore()
})

describe('Timesheets API', () => {

  it('should return 403 if no JWT is provided', async () => {
    const res = await request(strapi.server.httpServer)
      .get('/api/timesheets')
      .set('accept', 'application/json')

    expect(res.status).toBe(403)
  })

  it('should fetch all timesheets grouped by date', async () => {

    nock(`https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports`)
      .post('/detailed')
      .reply(200, clockifyDetailed)

    const res = await request(strapi.server.httpServer)
      .get('/api/timesheets?filters[year][$eq]=2025')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    let key = Object.keys(res.body.data.dates)[0]
    let date = DateTime.fromISO(key)

    expect(res.status).toBe(200)
    expect(date.isValid).toBe(true)
    expect(Array.isArray(res.body.data.dates[key])).toBe(true)
  })

  it('should return leave for the current leave year', async () => {

    let startDate = DateTime.utc(Number(2025), 8),
        endDate = startDate.plus({ year: 1 })

    const period = Interval.fromDateTimes(startDate.startOf('day'), endDate.endOf('day'))

    // Two mocks to cover the two calls in the function
    nock('https://sageapps.ncl.ac.uk/public')
      .get('/turner?YEAR=2024-2025')
      .reply(200, [])

    nock('https://sageapps.ncl.ac.uk/public')
      .get('/turner?YEAR=2025-2026')
      .reply(200, leaveEntries)

    const res = await request(strapi.server.httpServer)
      .get('/api/timesheets/leave?filters[year][$eq]=2025')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
    expect(res.body.data[0]).toHaveProperty('DATE')
    expect(period.contains(DateTime.fromISO(res.body.data[0].DATE))).toBe(true)
  })

  it('should return leave for the current leave year for a specific RSE', async () => {

    let startDate = DateTime.utc(Number(2025), 8),
        endDate = startDate.plus({ year: 1 })

    const period = Interval.fromDateTimes(startDate.startOf('day'), endDate.endOf('day'))

    // Two mocks to cover the two calls in the function
    nock('https://sageapps.ncl.ac.uk/public')
      .get('/turner?YEAR=2024-2025')
      .reply(200, [])

    nock('https://sageapps.ncl.ac.uk/public')
      .get('/turner?YEAR=2025-2026')
      .reply(200, leaveEntries)

    const res = await request(strapi.server.httpServer)
      .get(`/api/timesheets/leave?filters[year][$eq]=2025&filters[username][$eq]=bcarter`)
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
    expect(res.body.data.every(entry => entry.ID === 'bcarter')).toBe(true)
  })

  it('should return a full calendar for a given RSE', async () => {

    // Mock gov.uk bank holidays
    nock('https://www.gov.uk')
      .get('/bank-holidays.json')
      .reply(200, bankHolidays)

    // Two mocks to cover the two calls to the leave system in the function
    nock('https://sageapps.ncl.ac.uk/public')
      .get('/turner?YEAR=2024-2025')
      .reply(200, [])

    nock('https://sageapps.ncl.ac.uk/public')
      .get('/turner?YEAR=2025-2026')
      .reply(200, leaveEntries)

    // Mock the detailed report from Clockify
    nock(`https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports`)
      .post('/detailed')
      .reply(200,clockifyDetailedUser)

    // Use ID of the test user Ben Carter 

    const res = await request(strapi.server.httpServer)
      .get('/api/rses/swosoie5u3vml0xvfvabbijp/calendar')
      .set('accept', 'application/json')
      .set('Authorization', `Bearer ${JWT}`)

    expect(res.status).toBe(200)
  })

  // it('should return 200 for /timesheets/summary endpoint', async () => {
  //   const res = await request(strapi.server.httpServer)
  //     .get('/api/timesheets/summary')
  //     .set('accept', 'application/json')
  //     .set('Authorization', `Bearer ${JWT}`)

  //   expect(res.status).toBe(200)
  // })

  // it('should return 200 for /timesheets/utilisation endpoint', async () => {
  //   const res = await request(strapi.server.httpServer)
  //     .get('/api/timesheets/utilisation')
  //     .set('accept', 'application/json')
  //     .set('Authorization', `Bearer ${JWT}`)

  //   expect(res.status).toBe(200)
  // })
})