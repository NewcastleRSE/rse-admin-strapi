"use strict"

/**
 * rse service.
 */

const { createCoreService } = require("@strapi/strapi").factories
const { DateTime, Interval } = require("luxon")


module.exports = createCoreService('api::rse.rse', () => ({
  async find(...args) {

    let populate = {
      assignments: false,
      capacities: false
    }

    if(!args[0].populate || Array.isArray(args[0].populate)) {
      args[0].populate = { assignments: true, capacities: true }
    }
    else {
      if(Object.keys(args[0].populate).includes('assignments')) {
        populate.assignments = true
      }
      else {  
        args[0].populate['assignments'] = true
      }
  
      if(Object.keys(args[0].populate).includes('capacities')) {
        populate.capacities = true
      }
      else {
        args[0].populate['capacities'] = true
      }
    }

    const { results, pagination } = await super.find(...args)

    let rses = results
    
    rses.forEach((rse, index) => {

      // Sort assignments by start date
      rse.assignments = rse.assignments.sort((a, b) => DateTime.fromISO(a.start) - DateTime.fromISO(b.start))

      // Only look at assignments that end in the future
      const assignments = rse.assignments.filter(assignment => { return DateTime.fromISO(assignment.end) >= DateTime.now() }),
            endDates = assignments.reduce((dates, assignment) => { dates.push(DateTime.fromISO(assignment.end)); return dates }, []).sort((a, b) => a - b)

      if(!rse.active || endDates.length === 0) {
        rse.nextAvailableDate = null
        rse.nextAvailableFTE = null
      }
      else {
        // Loop over end dates
        for(const date of endDates) {

          let assignments = [],
              capacities = []

          // Find assignments that are concurrent with the end date
          rse.assignments.forEach((assignment) => {
            const period = Interval.fromDateTimes(DateTime.fromISO(assignment.start), DateTime.fromISO(assignment.end))
            period.contains(date.plus({ days: 1})) ? assignments.push(assignment) : null
          })

          // Find capacities that are concurrent with the end date
          rse.capacities.forEach((capacity) => {
            // If end date is null, set it to 20 years in the future
            capacity.end = capacity.end ? capacity.end : DateTime.now().plus({ years: 20}).toISODate()
            const period = Interval.fromDateTimes(DateTime.fromISO(capacity.start), DateTime.fromISO(capacity.end))
            period.contains(date.plus({ days: 1})) ? capacities.push(capacity) : null
          })

          // Reduce down total assigned time and capacity time
          const assigned = assignments.reduce((total, assignment) => total + assignment.fte, 0),
                capacity = capacities.reduce((total, capacity) => total + capacity.capacity, 0)

          // If there is capacity available, set the next available date and FTE
          if(capacity - assigned > 0) {
            rse.nextAvailableDate = date.plus({ days: 1 }).toISODate()
            rse.nextAvailableFTE = capacity - assigned
            break
          }
        }
      }

      // cleanup if assignments and capacities are not requested
      if(!populate.assignments) { delete results[index].assignments }
      if(!populate.capacities) { delete results[index].capacities }
    })

    return { results, pagination }
  },
  async findOne(entityId, params) {

    let populate = {
      assignments: true,
      capacities: true
    }

    // If populate is not set, populate assignments and capacities
    if(params.populate && !params.populate.isArray && params.populate.assignments && params.populate.capacities) {
      params.populate = ['assignments', 'capacities']
    }
    else {
      if(!params.populate || !params.populate.isArray) {
        params.populate = []
      }
  
      if(!params.populate.includes('assignments')) {
        populate.assignments = false
        params.populate.push('assignments')
      }
  
      if(!params.populate.includes('capacities')) {
        populate.capacities = false
        params.populate.push('capacities')
      }
    }
   
    const result = await super.findOne(entityId, params)
    
    let rse = result

    // Sort assignments by start date
    rse.assignments = rse.assignments.sort((a, b) => DateTime.fromISO(a.start) - DateTime.fromISO(b.start))

    // Only look at assignments that end in the future
    const assignments = rse.assignments.filter(assignment => { return DateTime.fromISO(assignment.end) >= DateTime.now() }),
          endDates = assignments.reduce((dates, assignment) => { dates.push(DateTime.fromISO(assignment.end)); return dates }, []).sort((a, b) => a - b)

    if(!rse.active || endDates.length === 0) {
      rse.nextAvailableDate = null
      rse.nextAvailableFTE = null
    }
    else {
      // Loop over end dates
      for(const date of endDates) {

        let assignments = [],
            capacities = []

        // Find assignments that are concurrent with the end date
        rse.assignments.forEach((assignment) => {
          const period = Interval.fromDateTimes(DateTime.fromISO(assignment.start), DateTime.fromISO(assignment.end))
          period.contains(date.plus({ days: 1})) ? assignments.push(assignment) : null
        })

        // Find capacities that are concurrent with the end date
        rse.capacities.forEach((capacity) => {
          // If end date is null, set it to 20 years in the future
          capacity.end = capacity.end ? capacity.end : DateTime.now().plus({ years: 20}).toISODate()
          const period = Interval.fromDateTimes(DateTime.fromISO(capacity.start), DateTime.fromISO(capacity.end))
          period.contains(date.plus({ days: 1})) ? capacities.push(capacity) : null
        })

        // Reduce down total assigned time and capacity time
        const assigned = assignments.reduce((total, assignment) => total + assignment.fte, 0),
              capacity = capacities.reduce((total, capacity) => total + capacity.capacity, 0)

        // If there is capacity available, set the next available date and FTE
        if(capacity - assigned > 0) {
          rse.nextAvailableDate = date.plus({ days: 1 }).toISODate()
          rse.nextAvailableFTE = capacity - assigned
          break
        }
      }
    }

    // cleanup if assignments and capacities are not requested
    if(!populate.assignments) { delete result.assignments }
    if(!populate.capacities) { delete result.capacities }

    return result
  }
}))