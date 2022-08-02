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
    let lastAssignment = new Date(Math.max(...assignments.map(e => new Date(e.end))));
    let lastAssignmentEnd = assignments.length > 0 ? DateTime.fromISO(lastAssignment.toISOString()) : DateTime.now()
    let assignmentsEnd

    // If RSE has fixed term contract and end is later than last assignment
    if(contractEnd && contractEnd > lastAssignmentEnd) {
        assignmentsEnd = contractEnd
    }
    // Contract is open-ended, extend 24 months into the future past last assignment end date
    else {
        assignmentsEnd = lastAssignmentEnd.plus({years: 2})
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
                let currentAvailability = availability[year][month-1]
                availability[year][month-1] = currentAvailability - assignment.fte

                // How to handle when assignments are more than availability?
                if(availability[year][month-1] < 0) {
                    // console.log(rse.firstname + ' ' + rse.lastname)
                    // console.log(year + '-' + month + ': ' + currentAvailability)
                    // console.log(assignment)
                }

                month++
            }
            year++
        }
    })

    return availability
}

module.exports = createCoreService('api::rse.rse', ({ strapi }) => ({
    async find(...args) {  

        // Get availability
        const assignments = await strapi.service('api::assignment.assignment').find({
            populate: ['rse', 'project']
        })

        const capacities = await strapi.service('api::capacity.capacity').find({
            populate: ['rse']
        })
    
        let { results, pagination } = await super.find(...args);

        let objects = results;
        results = []

        objects.forEach((object) => {

            let rse = object

            let rseAssignments = assignments.results.filter((assignment) => {
                return assignment.rse.id === rse.id
            })

            let rseCapacity = capacities.results.filter((capacity) => {
                return capacity.rse.id === rse.id
            })
    
            let availability = getAvailability(rse, rseAssignments, rseCapacity)

            let date = DateTime.now(),
                availabilityYears = Object.keys(availability),
                availableYear = null,
                availableMonth = null

            for (const year of availabilityYears) { 
                // Availability is this year on in future
                if(parseInt(year) >= date.year) {
                    let month = availability[year].findIndex(function(availability) {
                        return availability > 0;
                    });
                    // Availability Found
                    if(month > -1) {
                        availableYear = parseInt(year)
                        availableMonth = month + 1
                        break
                    }
                }
            }
            if(availableMonth === null) {
                if(rse.contractEnd) {
                    let contractEndDate = DateTime.fromISO(rse.contractEnd)
                    availableYear = contractEndDate.year
                    availableMonth = contractEndDate.month 
                }
                else {
                    console.error(`${rse.firstname} ${rse.lastname} has no availability` )
                    console.log(availability)
                }
            }

            rse.nextAvailableDate = DateTime.utc(availableYear, availableMonth, 1)
            rse.nextAvailableFTE = availability[rse.nextAvailableDate.year][rse.nextAvailableDate.month]
            rse.availability = availability

            results.push(rse)
        })

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
