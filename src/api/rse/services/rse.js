"use strict"

/**
 * rse service.
 */

const { createCoreService } = require("@strapi/strapi").factories


module.exports = createCoreService('api::rse.rse')
/*
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

    return { data: results, meta: pagination }
  }
}))
*/