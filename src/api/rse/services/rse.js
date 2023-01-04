'use strict';

/**
 * rse service.
 */

const { DateTime } = require("luxon");
const { createCoreService } = require('@strapi/strapi').factories;

function getAvailability(rse, assignments, capacities) {

    // Initialize years
    let contractStart = DateTime.fromISO(rse.contractStart)
    let contractEnd = DateTime.fromISO(rse.contractEnd)
    let lastAssignment = new Date(Math.max(...assignments.map(e => new Date(e.end))))
    let lastAssignmentEnd = assignments.length > 0 ? DateTime.fromISO(lastAssignment.toISOString()) : DateTime.now()
    let assignmentsEnd

    // RSE has fixed term contract and end is later than last assignment
    if(contractEnd && contractEnd > lastAssignmentEnd) {
        assignmentsEnd = contractEnd
        // console.log(`${rse.firstname} ${rse.lastname}: Contract Ends ${assignmentsEnd}`)
    }
    // RSE has fixed term contract and end is earlier than last assignment
    else if(contractEnd && contractEnd < lastAssignment) {
        assignmentsEnd = lastAssignmentEnd
        // console.log(`${rse.firstname} ${rse.lastname}: Assignment Ends  ${assignmentsEnd}`)
    }
    // Contract is open-ended, extend 24 months into the future past last assignment end date
    else {
        assignmentsEnd = lastAssignmentEnd.plus({years: 2})
       // console.log(`${rse.firstname} ${rse.lastname}: Open Ended  ${assignmentsEnd}`)
    }

    let availability = {}

    // Create outer availability object
    let year = contractStart.year
    while(year <= assignmentsEnd.year) {
        // Default to 100 percent availability each month
        availability[year] = new Array(12).fill(100)
        year++
    }

    // Set months in first year before contract start to null
    let startMonth = 1
    while(startMonth < contractStart.month) {
        availability[contractStart.year][startMonth-1] = null
        startMonth++
    }

    if(rse.contractEnd) {
        // Set months in final year before contract end to null
        let endMonth = 12
        while(endMonth > contractEnd.month) {
            availability[contractEnd.year][endMonth-1] = null
            endMonth--
        }
    } else {
        // Set months in final year of assignments end to null
        let endMonth = 12
        while(endMonth > assignmentsEnd.month) {
            availability[assignmentsEnd.year][endMonth-1] = null
            endMonth--
        }
    }

    // Use each capacity to update availability
    capacities.forEach((capacity) => {
        let start = DateTime.fromISO(new Date(capacity.start).toISOString())
        let end = assignmentsEnd

        if(capacity.end) {
            end = DateTime.fromISO(new Date(capacity.end).toISOString())
        }
        
        // Loop over each year in the capacity
        let year = start.year
        while(year <= end.year) {
            // Loop over each month in the year the capacity is valid for
            let month = year === start.year ? start.month : 1
            let endMonth = year === end.year ? end.month : 12
            while(month <= endMonth) {

                // capacity spans new year so needs to be added as key
                if(!availability.hasOwnProperty(year)) {
                    availability[year] = []
                }

                // Set assignment FTE from that months capacity
                availability[year][month-1] = capacity.capacity
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
        while(year <= end.year) {
            // Loop over each month in the year the assignment is valid for
            let month = year === start.year ? start.month : 1
            let endMonth = year === end.year ? end.month : 12
            while(month <= endMonth) {
                // Subtract assignment FTE from that months availability
                let maxAvailability = availability[year][month-1],
                    currentAvailability = maxAvailability - assignment.fte
                availability[year][month-1] = currentAvailability < 0 ? 0 : currentAvailability

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
        results = []

        for await (const rse of rses) {

            // Get availability
            const assignments = await strapi.service('api::assignment.assignment').find({
                populate: ['rse', 'project'],
                filters: {
                    rse: rse.id
                }
            })

            const capacities = await strapi.service('api::capacity.capacity').find({
                populate: ['rse'],
                filters: {
                    rse: rse.id
                }
            })
    
            let availability = getAvailability(rse, assignments.results, capacities.results),
                currentDate = DateTime.now(),
                contractEndDate = rse.contractEnd ? DateTime.fromISO(rse.contractEnd) : null,
                nextAvailableDate = null

            let year = contractEndDate ? contractEndDate.year : currentDate.year,
                month = null

            // Loop over years starting from contract end year or current year
            while(year < Math.max(...Object.keys(availability).map(Number))) {
                
                let i = 0
                
                // If current year set start of next month
                if(year === currentDate.year) {
                    i = currentDate.month - 1
                }
                
                // Loop over months in year
                for(i; i<availability[year].length; i++) {
                    // If availability found set month from index and break out of loop
                    if(availability[year][i] > 0) {
                        month = i + 1
                        break
                    }
                }
                // If month has been set break out of loop
                if(month) { break }
                year++
            }
            
            // Availability found, create date object
            if(month) {
                let day = 1
                if(currentDate.year === year && currentDate.month === month) {
                    day = currentDate.day
                }
                nextAvailableDate = DateTime.utc(year, month, day)
                // console.log(`${rse.firstname} ${rse.lastname} ${nextAvailableDate.toISODate()}`)
            }
            // RSE has no availability
            else {
                if(contractEndDate > currentDate) {
                    console.error(`${rse.firstname} ${rse.lastname} has no availability` )
                }
            }

            try{

            rse.lastAssignmentEnd = new Date(Math.max(...assignments.results.map(e => DateTime.fromJSDate(new Date(e.end)).toISODate() )))
            rse.nextAvailableDate = nextAvailableDate ? nextAvailableDate.toISODate() : null
            rse.nextAvailableFTE = availability[year][month-1]
            rse.availability = availability
            }
            catch(err) {
                console.log(rse)
            }

            results.push(rse)
        }

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

        const capacities = await strapi.service('api::capacity.capacity').find({
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
        let availability = getAvailability(result, assignments.results, capacities.results)

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
