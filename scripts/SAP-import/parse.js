'use strict'

const fs = require('fs')
const { DateTime } = require("luxon");

let rseProjects = JSON.parse(fs.readFileSync('RSE Team.json')),
    team = JSON.parse(fs.readFileSync('team.json')),
    projects = JSON.parse(fs.readFileSync('projects.json')),
    assignments = []

rseProjects.forEach(rseProject => {

    let keys = Object.keys(rseProject)

    let rse = team.find(rse => Number.parseInt(rse.personnelNumber) === rseProject['Personnel Number']),
        project = projects.find(project => project.name === rseProject.Title)

    let assignmentTemplate = {
        rse: rse ? Number.parseInt(rse.id) : null,
        project: project ? Number.parseInt(project.id) : rseProject.Title,
        fte: 0,
        start: null,
        end: null
    }

    let globalFTE = 0

    keys.forEach((key) => {

        let date = DateTime.fromISO(key)

        if(date.isValid) {

            let assignment = JSON.parse(JSON.stringify(assignmentTemplate))
            
            // Convert percent to decimal   
            assignment.fte = parseFloat(rseProject[key])
    
            // reset NaN values
            if(isNaN(assignment.fte)) {
                assignment.fte = 0
            }

            // fte has not changed
            if (assignment.fte === globalFTE) {
                assignments[assignments.length - 1].end = date.plus({ months: 1 }).minus({ days: 1 }).toISODate()
            }
            // fte has changed
            else {
                globalFTE = assignment.fte
                assignment.start = date.toISODate()
                assignments.push(assignment)
            }
        }
    })
})
assignments = assignments.filter(assignment => (assignment.fte > 0 && assignment.project !== 'Digital Institute' && assignment.project !== 'RSE Facility'))

let assignmentId = 1

assignments.forEach(assignment => {
    assignment.id = Number.parseInt(assignmentId)
    assignmentId++
})

fs.writeFileSync('assignments.json', JSON.stringify(assignments))
// console.log(assignments.filter(assignment => (!Number.isInteger(assignment.project))))