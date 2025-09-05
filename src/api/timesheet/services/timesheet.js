'use strict'

const { createCoreService } = require('@strapi/strapi').factories
const { DateTime, Interval } = require('luxon')
const { setupCache } = require('axios-cache-interceptor')
let axios = require('axios')
const { sum } = require('pdf-lib')

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

async function fetchSummaryReport(year, userIDs, projectIDs) {
    let startDate = DateTime.utc(year, 8),
        endDate = startDate.plus({ year: 1 }).minus({ days: 1 }).endOf('day')

    let payload = {
      dateRangeStart: startDate.toISO(),
      dateRangeEnd: endDate.toISO(),
      summaryFilter: {
        groups: ['USER', 'MONTH', 'PROJECT']
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

    return await axios.post('/summary', payload, clockifyConfig)
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
        duration: leaveDay.DURATION === 'Y' ? 7.26 : 3.63,
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
        if (period.contains(DateTime.fromISO(leave.DATE)) && leave.STATUS !== '3') {
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
      return { data: [] }
    }
  },

  calendar: async(rseId, ...args) => {

    const startDate = DateTime.fromISO(`${args[0].filters.year.$eq}-08-01`),
          endDate = DateTime.fromISO(`${(Number(args[0].filters.year.$eq)+1)}-07-31`)

    // Filter for use when checking if an object with a date range overlaps with the year
    const dateRangeFilter = {
      $and: [
        {
          end: { $lt: startDate.toISODate() } 
        },
        {
          $or: [
            { 
              start: {
                $between: [startDate.toISODate(), endDate.toISODate() ]
              }
            },
            {
              $or: [
                {
                  end: {
                    $between: [startDate.toISODate(), endDate.toISODate() ]
                  }
                },
                {
                  end: {
                    $null: true
                  }
                }
              ]
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

    const rse = await strapi.service('api::rse.rse').findOne(rseId, rsePopulate)

    const holidays = await fetchBankHolidays(args[0].filters.year.$eq),
          leave = await strapi.service('api::timesheet.timesheet').leave({ filters: {...args[0].filters, username: [rse.username]} }),
          timesheets = await strapi.service('api::timesheet.timesheet').find({ filters: {...args[0].filters, userIDs: [rse.clockifyID]} })

    const calendar = createCalendar(rse, holidays, leave.data, rse.assignments, rse.capacities, timesheets.data, startDate, endDate)
    
    return { data: calendar, meta: { pagination: {}} }
  },

  summary: async(...args) => {

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
          $or: [
            {
              end: {
                $between: [startDate.toISODate(), endDate.toISODate() ]
              }
            },
            {
              end: {
                $null: true
              }
            }
          ]
        },
        {
          $and: [
            {
              start: { 
                $lt: startDate.toISODate()
              },
            },
            {
              end: {
                $gt: endDate.toISODate()
              }
            }
          ]
        }
      ]
    }

    const timesheets = await strapi.service('api::timesheet.timesheet').find(...args),
          assignments = await strapi.service('api::assignment.assignment').find({filters: dateRangeFilter}),
          capacities = await strapi.service('api::capacity.capacity').find({filters: dateRangeFilter}),
          holidays = await fetchBankHolidays(args[0].filters.year.$eq),
          annualLeave = await strapi.service('api::timesheet.timesheet').leave({...args[0]})

    const summary = {
      totals: {
        capacity: 0,
        assigned: 0,
        leave: 0,
        sickness: 0,
        recorded: 0,
        billable: 0,
        nonBillable: 0,
        volunteered: 0,
      },
      days: {
        capacity: [],
        assigned: [],
        leave: [],
        sickness: [],
        recorded: [],
        billable: [],
        nonBillable: [],
        volunteered: [],
      }
    }

    let date = startDate

    while(date <= endDate) {

      let holiday = holidays.find(holiday => holiday.date === date.toISODate()),
          leave = annualLeave.data.filter(leave => leave.DATE === date.toISODate() && leave.TYPE === 'AL'),
          sickness = annualLeave.data.filter(leave => leave.DATE === date.toISODate() && leave.TYPE === 'SICK')


      // Is a working day
      if(date.weekday < 6 && !holiday) {

        let dailyAssignments = assignments.results.filter(assignment => {
          // Build interval for assignment period
          const period = Interval.fromDateTimes(DateTime.fromISO(assignment.start).startOf('day'), DateTime.fromISO(assignment.end).endOf('day'))
          // Is current date in loop within the assignment period
          return period.contains(date)
        })

        let dailyCapacities = capacities.results.filter(capacity => {
            capacity.end = capacity.end ? capacity.end : endDate.toISODate()
            // Build interval for capacity period
            const period = Interval.fromDateTimes(DateTime.fromISO(capacity.start).startOf('day'), DateTime.fromISO(capacity.end).endOf('day'))
            // Is current date in loop within the capacity period
            return period.contains(date)
        })

        let timeEntries = timesheets.data.dates[date.toISODate()] || []

        let dailyTimesheetSummary = {
          leave: leave.reduce((total, entry) => total + (entry.DURATION === 'Y' ? 1 : 0.5), 0),
          sickness: sickness.reduce((total, entry) => total + (entry.DURATION === 'Y' ? 1 : 0.5), 0),
          recorded: timeEntries,
          billable: timeEntries.filter(entry => entry.billable),
          nonBillable: timeEntries.filter(entry => !entry.billable),
          volunteered: timeEntries.filter(entry => entry.projectName === 'Volunteering'),
        }

        // Reduce all timesheets down to a daily total in days
        summary.days.capacity.push(dailyCapacities.reduce((total, capacity) => total + (capacity.capacity / 100), 0).toFixed(1))
        summary.days.assigned.push(dailyAssignments.reduce((total, assignment) => total + (assignment.fte / 100), 0).toFixed(1))
        summary.days.leave.push((dailyTimesheetSummary.leave).toFixed(1))
        summary.days.sickness.push((dailyTimesheetSummary.sickness).toFixed(1))
        summary.days.recorded.push((dailyTimesheetSummary.recorded.reduce((total, entry) => total + entry.timeInterval.duration, 0) / 60 / 60 / 7.26).toFixed(1))
        summary.days.billable.push((dailyTimesheetSummary.billable.reduce((total, entry) => total + entry.timeInterval.duration, 0) / 60 / 60 / 7.26).toFixed(1))
        summary.days.nonBillable.push((dailyTimesheetSummary.nonBillable.reduce((total, entry) => total + entry.timeInterval.duration, 0) / 60 / 60 / 7.26).toFixed(1))
        summary.days.volunteered.push((dailyTimesheetSummary.volunteered.reduce((total, entry) => total + entry.timeInterval.duration, 0) / 60 / 60 / 7.26).toFixed(1))
      }
      else {
        summary.days.capacity.push(null)
        summary.days.assigned.push(null)
        summary.days.leave.push(null)
        summary.days.sickness.push(null)
        summary.days.recorded.push(null)
        summary.days.billable.push(null)
        summary.days.nonBillable.push(null)
        summary.days.volunteered.push(null)
      }

      date = date.plus({days: 1})
    }

    // Reduce daily totals to annual totals
    summary.totals.capacity = (summary.days.capacity.reduce((total, entry) => total + Number(entry), 0)).toFixed(1)
    summary.totals.assigned = (summary.days.assigned.reduce((total, entry) => total + Number(entry), 0)).toFixed(1)
    summary.totals.leave = (summary.days.leave.reduce((total, entry) => total + Number(entry), 0)).toFixed(1)
    summary.totals.sickness = (summary.days.sickness.reduce((total, entry) => total + Number(entry), 0)).toFixed(1)
    summary.totals.recorded = (summary.days.recorded.reduce((total, entry) => total + Number(entry), 0)).toFixed(1)
    summary.totals.billable = (summary.days.billable.reduce((total, entry) => total + Number(entry), 0)).toFixed(1)
    summary.totals.nonBillable = (summary.days.nonBillable.reduce((total, entry) => total + Number(entry), 0)).toFixed(1)
    summary.totals.volunteered = (summary.days.volunteered.reduce((total, entry) => total + Number(entry), 0)).toFixed(1)

    return { data: summary }
  },

  utilisation: async(...args) => {

    const query = args[0]

    const startDate = DateTime.fromISO(`${args[0].filters.year.$eq}-08-01`),
          endDate = DateTime.fromISO(`${(Number(args[0].filters.year.$eq)+1)}-07-31`)

    const dateRangeFilter = {
      $or: [
        { 
          start: {
            $between: [startDate.toISODate(), endDate.toISODate() ]
          }
        },
        { 
          $or: [
            {
              end: {
                $between: [startDate.toISODate(), endDate.toISODate() ]
              }
            },
            {
              end: {
                $null: true
              }
            }
          ]
        },
        {
          $and: [
            {
              start: { 
                $lt: startDate.toISODate()
              },
            },
            {
              end: {
                $gt: endDate.toISODate()
              }
            }
          ]
        }
      ]
    }

    // Year is always present due to middleware
    const year = Number(query.filters.year.$eq)
        
    // Optional query parameters
    const userIDs = query.filters.userIDs ? query.filters.userIDs.$in : null,
          projectIDs = query.filters.projectIDs ? query.filters.projectIDs.$in : null

    clockifyConfig.cache.override = query.clearCache && query.clearCache === 'true'

    const summary = await fetchSummaryReport(year, userIDs, projectIDs),
          annuaLeave = await strapi.service('api::timesheet.timesheet').leave(query),
          holidays = await fetchBankHolidays(year),
          rses = await strapi.service('api::rse.rse').find({populate: { capacities: { filters: dateRangeFilter } } })


    const holidayDates = holidays.map(holiday => DateTime.fromISO(holiday.date).toISODate())

    let data = {
      total: {
        billable: summary.data.totals[0].totalBillableTime,
        nonBillable: summary.data.totals[0].totalTime - summary.data.totals[0].totalBillableTime,
        recorded: summary.data.totals[0].totalTime
      },
      months: {},
      rses: {}
    }

    summary.data.groupOne.forEach(rse => {

      let profile = rses.results.find(r => r.clockifyID === rse._id)

      if(!profile) console.log(rse)

      const rseLeave = annuaLeave.data.filter(leave => leave.ID === profile.username)

      let months = []

      rse.children.forEach(month => {

        let billableTime = month.children.reduce((total, project) => project.amount > 0 ? total + project.duration : total + 0, 0)

        const start = DateTime.fromFormat(month.name, 'MMM yyyy').startOf('month'),
              end = start.month === DateTime.now().month && start.year === DateTime.now().year ? DateTime.now() : start.endOf('month')

        let date = start

        let monthlyCapacity = 0
    
        // calculate seconds available in the month
        while(date < end) {
          if(!date.isWeekend && !holidayDates.includes(date.toISODate())) {

            let leaveDay = rseLeave.find(leave => leave.DATE === date.toISODate())

            if(leaveDay) {
              // add 3.7 hours for half day leave
              monthlyCapacity += leaveDay.DURATION === 'Y' ? 0 : 3.7 * 60 * 60
            }
            else {
              monthlyCapacity += 7.4 * 60 * 60
            }
          }
          date = date.plus({days: 1})
        }

        // pro-rata based on rse capacity
        monthlyCapacity = monthlyCapacity * (profile.capacities[0].capacity / 100)

        months.push({
          month: start.month,
          year: start.year,
          recorded: month.duration,
          billable: billableTime,
          nonBillable: month.duration - billableTime,
          capacity: Number(monthlyCapacity.toFixed(0))
        })

        if(!data.months[`${start.toFormat('MMMM')}`]) { 
          data.months[`${start.toFormat('MMMM')}`] = {
            recorded: 0,
            billable: 0,
            nonBillable: 0,
            capacity: 0
          }
        }

        data.months[`${start.toFormat('MMMM')}`].recorded += month.duration
        data.months[`${start.toFormat('MMMM')}`].billable += billableTime
        data.months[`${start.toFormat('MMMM')}`].nonBillable += (month.duration - billableTime)
        data.months[`${start.toFormat('MMMM')}`].capacity += Number(monthlyCapacity.toFixed(0))
      })

      data.rses[profile.id] = {
        name: profile.displayName,
        total: {
          recorded: rse.duration,
          billable: months.reduce((total, month) => total + month.billable, 0),
          nonBillable: months.reduce((total, month) => total + month.nonBillable, 0),
          capacity: months.reduce((total, month) => total + month.capacity, 0),
        },
        months: months
      }
    })

    data.total.capacity = Object.values(data.rses).reduce((total, rse) => total + rse.total.capacity, 0)

    return data
  }
})
