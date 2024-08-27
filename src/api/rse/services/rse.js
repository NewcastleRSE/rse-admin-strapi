"use strict"

/**
 * rse service.
 */

const { DateTime, Interval } = require("luxon")
const { createCoreService } = require("@strapi/strapi").factories

function createCalendar(rse, holidays, leave, assignments, capacities, timesheets, startDate, endDate) {
  const dates = []

  let date = startDate

  while(date <= endDate) {

    const holiday = holidays.find(holiday => holiday.date === date.toISODate()),
          leaveDay = leave.find(leave => leave.DATE === date.toISODate() && leave.ID === rse.username),
          currentAssignments = assignments.filter(assignment => {
            const start = DateTime.fromISO(assignment.start),
                  end = DateTime.fromISO(assignment.end)
            return date >= start && date <= end && assignment.rse.id === rse.id
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

async function fetchBankHolidays(year) {
  const ukBankHolidays = await fetch('https://www.gov.uk/bank-holidays.json').then((response) => response.json())
        
  let bankHolidays = ukBankHolidays['england-and-wales'].events,
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

module.exports = createCoreService("api::rse.rse", ({ strapi }) => ({
  async find(...args) {
    let { results, pagination } = await super.find(...args)

    let rses = results
    results = []

    const year = args[0].filters.year ? args[0].filters.year.$eq : DateTime.now().year

    const startDate = DateTime.fromISO(`${year}-08-01`),
          endDate = DateTime.fromISO(`${(Number(year)+1)}-07-31`)

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

    const yearFilter = {
      year: { $eq: year }
    }

    let assignments = await strapi.service("api::assignment.assignment").find({filters: dateRangeFilter, populate: { rse: { fields: ['id'] }, project: { fields: ['name'] } } }),
        capacities = await strapi.service("api::capacity.capacity").find({filters: dateRangeFilter}),
        holidays = await fetchBankHolidays(year),
        leave = await strapi.service("api::timesheet.timesheet").findLeave({filters: yearFilter}),
        timesheets = await strapi.service("api::timesheet.timesheet").find({filters: yearFilter})

    
    for await (const rse of rses) {

      rse.calendar = createCalendar(rse, holidays, leave.data, assignments.results, capacities.results, timesheets.data, startDate, endDate)
      
      const nextAvailable = rse.calendar.find(day => (day.utilisation.unallocated > 0 && DateTime.fromISO(day.date) >= DateTime.now()))

      rse.nextAvailableDate = nextAvailable ? nextAvailable.date : null
      rse.nextAvailableFTE = nextAvailable ? nextAvailable.utilisation.unallocated : 0

      results.push(rse)
    }

    return { results, pagination }
  }
}))
