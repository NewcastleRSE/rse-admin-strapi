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

function getAvailability(rse, assignments, capacities) {
  // Initialize years
  let contractStart = DateTime.fromISO(rse.contractStart)
  let contractEnd = DateTime.fromISO(rse.contractEnd)
  let lastAssignment = new Date(
    Math.max(...assignments.map((e) => new Date(e.end)))
  )
  let lastAssignmentEnd =
    assignments.length > 0
      ? DateTime.fromISO(lastAssignment.toISOString())
      : DateTime.now()
  let assignmentsEnd

  // RSE has fixed term contract and end is later than last assignment
  if (contractEnd && contractEnd > lastAssignmentEnd) {
    assignmentsEnd = contractEnd
    // console.log(`${rse.firstname} ${rse.lastname}: Contract Ends ${assignmentsEnd}`)
  }
  // RSE has fixed term contract and end is earlier than last assignment
  else if (contractEnd && contractEnd < lastAssignment) {
    assignmentsEnd = lastAssignmentEnd
    // console.log(`${rse.firstname} ${rse.lastname}: Assignment Ends  ${assignmentsEnd}`)
  }
  // Contract is open-ended, extend 24 months into the future past last assignment end date
  else {
    assignmentsEnd = lastAssignmentEnd.plus({ years: 2 })
    // console.log(`${rse.firstname} ${rse.lastname}: Open Ended  ${assignmentsEnd}`)
  }

  let availability = {}

  // Create outer availability object
  let year = contractStart.year
  while (year <= assignmentsEnd.year) {
    // Default to 100 percent availability each month
    availability[year] = new Array(12).fill(100)
    year++
  }

  // Set months in first year before contract start to null
  let startMonth = 1
  while (startMonth < contractStart.month) {
    availability[contractStart.year][startMonth - 1] = null
    startMonth++
  }

  if (rse.contractEnd) {
    // Set months in final year before contract end to null
    let endMonth = 12
    while (endMonth > contractEnd.month) {
      availability[contractEnd.year][endMonth - 1] = null
      endMonth--
    }
  } else {
    // Set months in final year of assignments end to null
    let endMonth = 12
    while (endMonth > assignmentsEnd.month) {
      availability[assignmentsEnd.year][endMonth - 1] = null
      endMonth--
    }
  }

  // Use each capacity to update availability
  capacities.forEach((capacity) => {
    let start = DateTime.fromISO(new Date(capacity.start).toISOString())
    let end = assignmentsEnd

    if (capacity.end) {
      end = DateTime.fromISO(new Date(capacity.end).toISOString())
    }

    // Loop over each year in the capacity
    let year = start.year
    while (year <= end.year) {
      // Loop over each month in the year the capacity is valid for
      let month = year === start.year ? start.month : 1
      let endMonth = year === end.year ? end.month : 12
      while (month <= endMonth) {
        // capacity spans new year so needs to be added as key
        if (!availability.hasOwnProperty(year)) {
          availability[year] = []
        }

        // Set assignment FTE from that months capacity
        availability[year][month - 1] = capacity.capacity
        month++
      }
      year++
    }
  })

  // Use each assignment to update availability
  assignments.forEach((assignment) => {
    let start = DateTime.fromISO(new Date(assignment.start).toISOString())
    let end = DateTime.fromISO(new Date(assignment.end).toISOString())

    // Loop over each year in the assignment
    let year = start.year
    while (year <= end.year) {
      // Loop over each month in the year the assignment is valid for
      let month = year === start.year ? start.month : 1
      let endMonth = year === end.year ? end.month : 12
      while (month <= endMonth) {
        try {
          // Subtract assignment FTE from that months availability
          let maxAvailability = availability[year][month - 1],
              currentAvailability = maxAvailability - assignment.fte

          availability[year][month - 1] = currentAvailability < 0 ? 0 : currentAvailability
        }
        catch(ex){
          // console.log(ex)
          // console.log(rse)
          // console.log(year)
          // console.log(month)
        }
        month++
      }
      year++
    }
  })

  return availability
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

      let availability = getAvailability(
          rse,
          assignments.results.filter(assignment => assignment.rse === rse.id),
          capacities.results.filter(assignment => assignment.rse === rse.id)
        ),
        currentDate = DateTime.now(),
        contractEndDate = rse.contractEnd
          ? DateTime.fromISO(rse.contractEnd)
          : null,
        nextAvailableDate = null

      let year = contractEndDate ? contractEndDate.year : currentDate.year,
        month = null

      // Loop over years starting from contract end year or current year
      while (year < Math.max(...Object.keys(availability).map(Number))) {
        let i = 0

        // If current year set start of next month
        if (year === currentDate.year) {
          i = currentDate.month - 1
        }

        // Loop over months in year
        for (i; i < availability[year].length; i++) {
          // If availability found set month from index and break out of loop
          if (availability[year][i] > 0) {
            month = i + 1
            break
          }
        }
        // If month has been set break out of loop
        if (month) {
          break
        }
        year++
      }

      // Availability found, create date object
      if (month) {
        let day = 1
        if (currentDate.year === year && currentDate.month === month) {
          day = currentDate.day
        }
        nextAvailableDate = DateTime.utc(year, month, day)
        // console.log(`${rse.firstname} ${rse.lastname} ${nextAvailableDate.toISODate()}`)
      }
      // RSE has no availability
      else {
        if (contractEndDate > currentDate) {
          console.error(`${rse.firstname} ${rse.lastname} has no availability`)
        }
      }

      try {
        rse.lastAssignmentEnd = new Date(
          Math.max(
            ...assignments.results.map((e) =>
              DateTime.fromJSDate(new Date(e.end)).toISODate()
            )
          )
        )
        rse.nextAvailableDate = nextAvailableDate
          ? nextAvailableDate.toISODate()
          : null
        rse.nextAvailableFTE = availability[year][month - 1]
        rse.availability = availability
      } catch (err) {
        console.log(err)
      }

      results.push(rse)
    }

    return { results, pagination }
  }
}))
