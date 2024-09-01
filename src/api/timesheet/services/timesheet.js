'use strict'

const { createCoreService } = require('@strapi/strapi').factories
const { DateTime, Interval } = require('luxon')
const { setupCache } = require('axios-cache-interceptor')
let axios = require('axios')

const instance = axios.create()
axios = setupCache(instance, {
  methods: ['get', 'post']
})

const clockifyConfig = {
  baseURL: `https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports`,
  headers: {
    'X-Api-Key': process.env.CLOCKIFY_KEY,
  },
  cache: {
    maxAge: 60 * 60 * 1000
  }
}

const bankHolidaysConfig = {
  baseURL: 'https://www.gov.uk',
  cache: {
    maxAge: 24 * 60 * 60 * 1000
  }
}

const leaveConfig = {
  baseURL: 'https://sageapps.ncl.ac.uk/public/',
  headers: {
    Authorization: `Bearer ${process.env.LEAVE_API_TOKEN}`
  },
  cache: {
    maxAge: 60 * 60 * 1000
  }
}

async function fetchBankHolidays(year) {
  const response = await axios.get('/bank-holidays.json', bankHolidaysConfig)
        
  let bankHolidays = response.data['england-and-wales'].events,
        closures = []

  if(year) {
    const startDate = DateTime.fromISO(`${year}-08-01`),
          endDate = DateTime.fromISO(`${(Number(year)+1)}-07-31`)

    bankHolidays = bankHolidays.filter(holiday => {
      const holidayDate = DateTime.fromISO(holiday.date)
      return holidayDate >= startDate && holidayDate <= endDate
    })
  }

  const christmases = bankHolidays.filter(holiday => holiday.title === 'Christmas Day')

  christmases.forEach(christmas => {
      const christmasBankHoliday = DateTime.fromISO(christmas.date)
      const christmasEve = DateTime.fromISO(`${christmasBankHoliday.year}-12-24`)

      for(let i=0; i<=7; i++) {
          let closureDate = christmasEve.plus({days: i})
          
          if(closureDate.toISODate() !== christmasBankHoliday.toISODate()) {
              closures.push({
                  title: 'University Closure',
                  date: closureDate.toISODate(),
                  notes: '',
                  bunting: false
              })
          } 
      }

      // If Christmas Eve is a Tuesday, the closure will start the day before
      if(christmasEve.weekday === 2) {
          closures.push({
              title: 'University Closure',
              date: christmasEve.minus({days: 1}).toISODate(),
              notes: '',
              bunting: false
          })
      }
  })

  return [...closures, ...bankHolidays]
}

async function fetchDetailedReport(year, userIDs, projectIDs, page = 1, timeEntries = []) {
    let startDate = DateTime.utc(year, 8),
        endDate = startDate.plus({ year: 1 }).minus({ days: 1 }).endOf('day')

    let payload = {
      dateRangeStart: startDate.toISO(),
      dateRangeEnd: endDate.toISO(),
      detailedFilter: {
        page: page,
        pageSize: 1000,
      }
    }

    if(userIDs) {
      payload.users = {
        ids: userIDs,
        contains: 'CONTAINS',
        status: 'ALL',
      }
    }

    if(projectIDs) {
      payload.projects = {
        ids: projectIDs,
        contains: 'CONTAINS',
        status: 'ALL',
      }
    }

    const response = await axios.post('/detailed', payload, clockifyConfig)

    timeEntries = [...timeEntries, ...response.data.timeentries]

    if(timeEntries.length < response.data.totals[0].entriesCount) {
      return fetchDetailedReport(year, userIDs, projectIDs, page + 1, timeEntries)
    }
    else {
      return timeEntries
    }
}

function createCalendar(rse, holidays, leave, assignments, capacities, timesheets, startDate, endDate) {
  const dates = []

  let date = startDate

  while(date <= endDate) {

    const holiday = holidays.find(holiday => holiday.date === date.toISODate()),
          leaveDay = leave.find(leave => leave.DATE === date.toISODate() && leave.ID === rse.username),
          currentAssignments = assignments.filter(assignment => {
            const start = DateTime.fromISO(assignment.start),
                  end = DateTime.fromISO(assignment.end)
            return date >= start && date <= end
          })

    let dateCapacity = 0
      
    capacities.forEach(capacity => {

        capacity.end = capacity.end ? capacity.end : endDate.toISODate()

        // Build interval for capacity period
        const period = Interval.fromDateTimes(DateTime.fromISO(capacity.start), DateTime.fromISO(capacity.end))

        // Is current date in loop within the capacity period
        if(period.contains(date)) {
          dateCapacity = capacity.capacity
        }
    })

    const timesheetReport = timesheets.dates[date.toISODate()],
          timesheetSummary = []

    if(timesheetReport) {
      timesheetReport.filter(timesheet => timesheet.userId === rse.clockifyID).forEach(timesheet => {
        timesheetSummary.push({
          start: timesheet.timeInterval.start,
          end: timesheet.timeInterval.end,
          duration: timesheet.timeInterval.duration,
          billable: timesheet.billable,
          project: timesheet.projectName,
        })
      })
    }

    let day = {
      date: date.toISODate(),
      metadata: {
        day: date.day,
        month: date.month,
        year: date.year,
        dayOfWeek: date.weekday,
        isWeekend: date.weekday > 5,
        isWorkingDay: date.weekday < 6 && !holiday
      },
      utilisation: {
        capacity: dateCapacity,
        allocated: currentAssignments.reduce((total, assignment) => total + assignment.fte, 0),
        unallocated: dateCapacity - currentAssignments.reduce((total, assignment) => total + assignment.fte, 0),
        recorded: {
          billable: timesheetSummary.reduce((total, timesheet) => total + (timesheet.billable ? timesheet.duration : 0), 0),
          nonBillable: timesheetSummary.reduce((total, timesheet) => total + (timesheet.billable ? 0 : timesheet.duration), 0)
        }
      },
      holiday: holiday ? holiday : null,
      leave: leaveDay ? { 
        type: leaveDay.TYPE,
        durationCode: leaveDay.DURATION,
        duration: leaveDay.DURATION === 'Y' ? 7.4 : 3.7,
        status: leaveDay.STATUS
      } : null,
      assignments: currentAssignments.map(({ rse, ...assignment }) => assignment),
      timesheet: timesheetSummary
    }

    dates.push(day)

    date = date.plus({days: 1})
  }

  return dates
}

// Creates and returns a report for all users in the workspace.
module.exports = ({ strapi }) =>  ({
  /**
   * Promise to fetch all records.
   *
   * @return {Promise}
   */
  find: async(...args) => {
    try {

      const query = args[0]

      // Year is always present due to middleware
      const year = Number(query.filters.year.$eq)
         
      // Optional query parameters
      const userIDs = query.filters.userIDs ? query.filters.userIDs.$in : null,
            projectIDs = query.filters.projectIDs ? query.filters.projectIDs.$in : null

      clockifyConfig.cache.override = query.clearCache && query.clearCache === 'true'

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
            total: Object.keys(data.dates).length
          }
        }
      }
    } catch (error) {
      console.error(error)
    }
  },

  leave: async(...args) => {

    const query = args[0]

    let username

    if(query.filters.username) {
      username = query.filters.username.$eq
    }

    leaveConfig.cache.override = query.clearCache && query.clearCache === 'true'

    const currentDate = DateTime.utc()

    let startDate = DateTime.utc(Number(query.filters.year.$eq), 8),
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
  },

  calendar: async(rseId, ...args) => {

    const startDate = DateTime.fromISO(`${args[0].filters.year.$eq}-08-01`),
          endDate = DateTime.fromISO(`${(Number(args[0].filters.year.$eq)+1)}-07-31`)

    // Filter for use when checking if an object with a date range overlaps with the year
    const dateRangeFilter = {
      $or: [
        { 
          start: {
            $between: [startDate.toISODate(), endDate.toISODate() ]
          }
        },
        {
          end: { 
            $between: [startDate.toISODate(), endDate.toISODate() ]
          }
        },
        {
          start: { 
            $lt: startDate.toISODate()
          },
          end: {
            $gt: endDate.toISODate()
          }
        }
      ]
    }
  
    const rsePopulate = {
      populate: {
        assignments: {
          populate: {
            project: {
              fields: ['name']
            }
          }
        },
        capacities: true
      },
      filters: {
        assignments: dateRangeFilter,
        capacities: dateRangeFilter
      }
    }

    const rse = await strapi.services['api::rse.rse'].findOne(rseId, rsePopulate)

    const holidays = await fetchBankHolidays(args[0].filters.year.$eq),
          leave = await strapi.services['api::timesheet.timesheet'].leave({ filters: {...args[0].filters, username: [rse.username]} }),
          timesheets = await strapi.services['api::timesheet.timesheet'].find({ filters: {...args[0].filters, userIDs: [rse.clockifyID]} })

    const calendar = createCalendar(rse, holidays, leave.data, rse.assignments, rse.capacities, timesheets.data, startDate, endDate)
    
    return { data: calendar, meta: { pagination: {}} }
  },

  summary: async(...args) => {
    return { data: [] }
  }

})
