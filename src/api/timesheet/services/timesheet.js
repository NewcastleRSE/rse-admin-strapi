"use strict"

const { DateTime, Interval } = require("luxon")
const { setupCache } = require('axios-cache-interceptor')
let axios = require("axios")

const instance = axios.create()
axios = setupCache(instance, {
  methods: ['get', 'post'] 
})

const clockifyConfig = {
  baseURL: `https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports`,
  headers: {
    "X-Api-Key": process.env.CLOCKIFY_KEY,
  },
  id: 'clockify',
  cache: {
    // one hour
    maxAge: 60 * 60 * 1000
  }
}

const leaveConfig = {
  baseURL: 'https://sageapps.ncl.ac.uk/public/',
  headers: {
    Authorization: `Bearer ${process.env.LEAVE_API_TOKEN}`
  },
  id: 'leave',
  cache: {
    // one hour
    maxAge: 60 * 60 * 1000
  }
}

async function fetchDetailedReport(year = new Date().getFullYear(), userIDs, projectIDs, page = 1, timeEntries = []) {
    let startDate = DateTime.utc(year, 8),
        endDate = startDate.plus({ year: 1 })

    let payload = {
      dateRangeStart: startDate.toISO(),
      dateRangeEnd: endDate.toISO(),
      detailedFilter: {
        page: page,
        pageSize: 1000,
      },
      summaryFilter: {
        groups: ["USER"],
      }
    }

    if(userIDs) {
      payload.users = {
        ids: userIDs,
        contains: "CONTAINS",
        status: "ALL",
      }
    }

    if(projectIDs) {
      payload.projects = {
        ids: projectIDs,
        contains: "CONTAINS",
        status: "ALL",
      }
    }

    const response = await axios.post(`/detailed`, payload, clockifyConfig)

    timeEntries = timeEntries.concat(response.data.timeentries)

    if(timeEntries.length < response.data.totals[0].entriesCount) {
      return fetchDetailedReport(year, userIDs, projectIDs, page + 1, timeEntries)
    }
    else {
      return timeEntries
    }
}

// Creates and returns a report for all users in the workspace.
module.exports = {
  /**
   * Promise to fetch all records.
   *
   * @return {Promise}
   */
  async find(...args) {
    try {

      const query = args[0]

      const year = query ? Number(query.filters.year.$eq) : null,
            userIDs = query.filters.userIDs ? query.filters.userIDs.$in : null,
            projectIDs = query.filters.projectIDs ? query.filters.projectIDs.$in : null,
            clearCache = query.clearCache && query.clearCache === 'true' ? true : false

      console.log('clearCache:', clearCache)

      if (clearCache) {
        await axios.storage.remove('clockify')
        await axios.storage.remove('leave')
      }

      const response = await fetchDetailedReport(year, userIDs, projectIDs)

      let data = {
        dates: {}
      }

      response.forEach(entry => {

        const key = DateTime.fromISO(entry.timeInterval.start).toISODate()

        if(!(key in data.dates)) {
          data.dates[key] = []
        }
        
        data.dates[key].push(entry)
      })

      return {
        data: data,
        meta: {
          pagination: {
            page: 1,
            pageSize: 1000,
            pageCount: 1,
            total: data.length
          }
        }
      }
    } catch (error) {
      console.error(error)
    }
  },

  async findLeave(...args) {

    const query = args[0]

    let username

    if(query.filters.username) {
      username = query.filters.username.$eq
    }

    const currentDate = DateTime.utc()

    let startDate,
        endDate

    // Load leave of provided year
    if(query.filters.year.$eq) {
      startDate = DateTime.utc(Number(query.filters.year.$eq), 8)
    }
    // Is after december of the current financial year
    else if(currentDate.month < 8) {
      startDate = DateTime.utc(currentDate.year - 1, 8)
    }
    // Is before december of the current financial year
    else {
      startDate = DateTime.utc(currentDate.year, 8)
    }

    endDate = startDate.plus({ year: 1 })

    const period = Interval.fromDateTimes(startDate.startOf('day'), endDate.endOf('day'))

    try {
      // Due to the FY not being the same as the leave year, get the previous year too and combine the two
      const [response1, response2] = await Promise.all([
        axios.get(`/turner?YEAR=${startDate.year}-${endDate.year}`, leaveConfig),
        axios.get(`/turner?YEAR=${(startDate.year-1)}-${(endDate.year -1)}`, leaveConfig)
      ])

      const response = [...response1.data, ...response2.data]

      const FYleave = []

      // Include the leave that is within the FY period
      response.forEach(leave => {
        if (period.contains(DateTime.fromISO(leave.DATE))) {
          if(username && leave.ID !== username) return
          FYleave.push(leave)
        }
      })

      return {
        data: FYleave
      }
    }
    catch(ex) {
      console.error(ex)
    }
  }
}
