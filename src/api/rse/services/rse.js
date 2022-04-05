'use strict';

/**
 * rse service.
 */

const { DateTime } = require("luxon");
const { createCoreService } = require('@strapi/strapi').factories;

function getAvailability(rse, assignments) {

    // Initialize years
    let contractStart = DateTime.fromISO(rse.contractStart)
    let lastAssignment = new Date(Math.max(...assignments.map(e => new Date(e.end))));
    let contractEnd = DateTime.fromISO(lastAssignment.toISOString())
    let availability = {}

    // Create outer availability object
    let year = contractStart.year
    while(year <= contractEnd.year) {
        availability[year] = new Array(12).fill(100)
        year++
    }

    // Account for months in first year before contract start
    let month = 1
    while(month < contractStart.month) {
        availability[contractStart.year][month-1] = null
        month++
    }

    // Use each assignment to update availability
    assignments.forEach((assignment) => {
        let start = DateTime.fromISO(new Date(assignment.start).toISOString())
        let end = DateTime.fromISO(new Date(assignment.end).toISOString())

        // Loop over each year in the assignment
        let year = start.year
        while(year <= end.year) {
            // Loop over each month in the year the assignment is valid for
            let month = year === start.year ? start.month : 1
            let endMonth = year === end.year ? end.month : 12
            while(month <= endMonth) {
                availability[year][month-1] = availability[year][month-1] - assignment.fte
                month++
            }
            year++
        }
    })

    return availability
}

module.exports = createCoreService('api::rse.rse', ({ strapi }) => ({
    async find(...args) {  
    
        let { results, pagination } = await super.find(...args);

        let rses = results;
        results = rses.map(rse=> ({ ...rse, availability: getAvailability(rse) }))

        return { results, pagination };
    },
    async findOne(entryId, ...args) {

        // Get availability
        const assignments = await strapi.service('api::assignment.assignment').find({
            populate: ['rse'],
            filters: {
                rse: {
                    id: {
                        $eq: entryId
                    }
                }
            }
          })

        
    
        let result = await super.findOne(entryId, ...args);
        let availability = getAvailability(result, assignments.results)

        let date = DateTime.now()

        let month = availability[date.year].findIndex(function(availability) {
            return availability > 0;
        });

        result.nextAvailableDate = new Date(Date.UTC(date.year, month, 1))
        result.nextAvailableFTE = availability[date.year][month]
        result.availability = availability

        return result;
    }
}));
