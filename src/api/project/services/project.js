'use strict'

/**
 * projects service.
 */

const { createCoreService } = require('@strapi/strapi').factories
const camelcaseKeys = require('camelcase-keys')
const Hubspot = require('@hubspot/api-client')
const hubspotClient = new Hubspot.Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
const dealProperties = process.env.HUBSPOT_DEAL_PROPERTIES.split(','),
      contactProperties = process.env.HUBSPOT_CONTACT_PROPERTIES.split(','),
      noteProperties = process.env.HUBSPOT_NOTE_PROPERTIES.split(','),
      stages = {
        meetingScheduled: process.env.HUBSPOT_DEAL_MEETING_SCHEDULED,
        bidPreparation: process.env.HUBSPOT_DEAL_BID_PREPARATION,
        grantWriting: process.env.HUBSPOT_DEAL_GRANT_WRITING,
        submittedToFunder: process.env.HUBSPOT_DEAL_SUBMITTED_TO_FUNDER,
        awaitingAllocation: process.env.HUBSPOT_DEAL_FUNDED_AWAITING_ALLOCATION,
        notFunded: process.env.HUBSPOT_DEAL_NOT_FUNDED,
        allocated: process.env.HUBSPOT_DEAL_ALLOCATED,
        completed: process.env.HUBSPOT_DEAL_COMPLETED
      }

// Invert stages to key by Hubspot stage names
const invert = obj => Object.fromEntries(Object.entries(obj).map(a => a.reverse()))
const hsStages = invert(stages)

function formatDealStage(stage) {
  if(stage && hsStages[stage]) {
    return hsStages[stage].replace(/([A-Z])/g, ' $1').replace(/^./, function(str){ return str.toUpperCase() })
  }
  else {
    console.log(stage)
    console.log(hsStages)
    return stage
  }
}

async function getDeals(after, limit, properties, projectList) {
  try {
    let hsProjects = await hubspotClient.crm.deals.basicApi.getPage(limit, after, properties, [], ['contacts', 'notes'], false)
    projectList = projectList.concat(hsProjects.results)
    if(hsProjects.paging) {
      return getDeals(hsProjects.paging.next.after, limit, properties, projectList)
    }
    else {
      return projectList
    }
  } catch (e) {
    console.error(e)
  }
}

async function getAssociations(association, after, limit, properties, ids, associationList) {
  try {

    const publicObjectSearchRequest = {
      filterGroups: [{
        filters: [
          { propertyName: "hs_object_id", operator: "IN",  values: ids },
        ],
      }],
      properties,
      limit,
      after
    }

    let hsAssociations

    switch(association) {
      case 'contacts':
        hsAssociations = await hubspotClient.crm.contacts.searchApi.doSearch(publicObjectSearchRequest)
        associationList = associationList.concat(hsAssociations.results)
      case 'notes':
        hsAssociations = await hubspotClient.crm.objects.notes.searchApi.doSearch(publicObjectSearchRequest)
        associationList = associationList.concat(hsAssociations.results)
    }

    if(hsAssociations.paging) {
      return getAssociations(association, hsAssociations.paging.next.after, limit, properties, filterGroups, associationList)
    }
    else {
      return associationList
    }
  } catch (e) {
    console.error(e)
  }
}

module.exports = createCoreService('api::project.project', ({ strapi }) =>  ({

  async find(...args) {  

    let params = args[0]

    let { results, pagination } = await super.find(...args)

    const sort = JSON.stringify({
      propertyName: "dealname",
      direction: "ASCENDING",
    })
    const limit = 100
    const after = 0

    let hsProjects = await getDeals(after, limit, dealProperties, [])

    let contactAssociations = hsProjects.map(({associations})=>{ 
      if(associations && associations.contacts) {
        return associations.contacts.results
      }
      else {
        return []
      }
    })

    let noteAssociations = hsProjects.map(({associations})=>{ 
      if(associations && associations.notes) {
        return associations.notes.results
      }
      else {
        return []
      }
    })

    // Remove empty associations and map to array of IDs
    let contactIDs = [].concat.apply([], contactAssociations).map(contact => {
      return contact.id
    })

    let noteIDs = [].concat.apply([], noteAssociations).map(note => {
      return note.id
    })

    let contacts = [],
        notes = []

    // Can only fetch 100 associations at once, so run in loops to segment requests
    for (let i = 0; i < contactIDs.length; i = i+100) {
      contacts = contacts.concat(await getAssociations('contacts', 0, limit, contactProperties, contactIDs.slice(i, i+100), []))
    }

    console.log(contacts)

    for (let i = 0; i < noteIDs.length; i = i+100) {
      notes = notes.concat(await getAssociations('notes', 0, limit, noteProperties, noteIDs.slice(i, i+100), []))
    }
 
    // Project list from Strapi
    let sProjects = results

    // Clear results list ready for merging
    results = []

    // If there is a query by stage, filter results
    if (params && params.stage) {
      // Ensure stages is always an array
      let query = Array.isArray(params.stage) ? params.stage : [params.stage],
          hsStages = []

      query.forEach(stage => {
        hsStages.push(stages[stage])
      })

      hsProjects = hsProjects.filter(project => {
        return hsStages.includes(project.properties.dealstage)
      })
    }

    hsProjects.forEach((project) => {

      let projectContacts = [],
          projectNotes = []

      if (project.associations) {

        if(project.associations.contacts) {
          let associatedContacts = project.associations.contacts.results.map(contact => {
            return contact.id
          })

          contacts.filter(contact => {
            return associatedContacts.includes(contact.id)
          }).forEach(contact => {
            projectContacts.push({
              id: contact.id,
              firstname: contact.properties.firstname,
              lastname: contact.properties.lastname,
              email: contact.properties.email,
              jobtitle: contact.properties.jobtitle,
              department: contact.properties.department
            })
          })
        }

        if(project.associations.notes) {

          let associatedNotes = project.associations.notes.results.map(note => {
            return note.id
          })

          notes.filter(note => {
            return associatedNotes.includes(note.id)
          }).forEach(note => {
            projectNotes.push({
              id: note.id,
              note: note.properties.hs_note_body,
              created: note.properties.hs_createdate,
              lastUpdated: note.properties.hs_lastmodifieddate
            })
          })
        }
      }

      let result = project.properties
      result.id = project.id
      result.createdAt = project.createdAt
      result.updatedAt = project.updatedAt
      result.contacts = projectContacts
      result.notes = projectNotes

        // Modify project stage
        result.dealstage = formatDealStage(result.dealstage)

        // Fetch and set clockify ID
        var sProject = sProjects.find(result => {
          return project.id === result.hubspotID
        })

        if(sProject) {
          result.clockifyID = sProject.clockifyID
        }
        else {
          if (['Completed', 'Allocated', 'Awaiting Allocation'].includes(result.dealstage)) {
            console.error(`Project ${result.dealname} not found in Strapi database`)
            // Get or create the Clockify project
            strapi.service('api::timesheet.timesheet').createClockifyProject(camelcaseKeys(result)).then(clockifyProject => {
              // Create the entry in Strapi to link Hubspot and Clockify
              strapi.entityService.create('api::project.project', {
                data: {
                  name: result.dealname,
                  hubspotID: result.id,
                  clockifyID: clockifyProject.id
                }
              })
            }).catch(error => {
              console.log('Error creating ' + result.dealname)
              console.error(error)
            })
          }
        }

        results.push(camelcaseKeys(result))
    })

    pagination.page = 1
    pagination.pageCount = 1
    pagination.pageSize = results.length
    pagination.total = results.length

    return { results, pagination }
  },

  async findOne(...args) {

    const filter = [
      {
        filters: [
          {
            propertyName: "hs_object_id",
            operator: "EQ",
            value: args[0],
          },
        ],
      },
    ]

    const limit = 1
    const after = 0

    const publicObjectSearchRequest = {
      filterGroups: filter,
      properties,
      limit,
      after,
    }

    let response = await hubspotClient.crm.deals.searchApi.doSearch(publicObjectSearchRequest)

    let data = {}

    if(response.results.length === 1) {
        data = response.results[0]
    }
    else {
        console.error("ID should be unique")
    }

    return data
  },

  async update(...args) {
    // add error handling
    const id = args.id
    const status = args.status

    // add check if status is equal to Red, Amber or Green
    const prj = {
      id: id,
      properties: {
        status: status,
      },
    }

    await hubspotClient.crm.deals.batchApi
      .update({ inputs: [prj] })
      .then((results) => {
        return {results}
      })
      .catch((err) => {
        console.log(err)
      })
  }
}))