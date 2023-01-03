'use strict'

/**
 * projects service.
 */

const { createCoreService } = require('@strapi/strapi').factories
const camelcaseKeys = require('camelcase-keys')
const camelcase = require('camelcase')
const omitDeep = require('deepdash/omitDeep')
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

// Invert stages to key by HubSpot stage names
const invert = obj => Object.fromEntries(Object.entries(obj).map(a => a.reverse()))
const hsStages = invert(stages)

function formatDealStage(stage) {
  if(stage && hsStages[stage]) {
    return hsStages[stage].replace(/([A-Z])/g, ' $1').replace(/^./, function(str){ return str.toUpperCase() })
  }
  else {
    console.error(`${stage} is not in ${hsStages}`)
    return stage
  }
}

// Recursively fetch all HubSpot deals
async function getDeals(after, limit, stages, projectList) {
  try {

    const publicObjectSearchRequest = {
      filterGroups: [{
        filters: [
          { propertyName: "dealstage", operator: "IN",  values: stages },
        ],
      }],
      properties: dealProperties,
      limit,
      after
    }

    let hsProjects = await hubspotClient.crm.deals.searchApi.doSearch(publicObjectSearchRequest)
    projectList = projectList.concat(hsProjects.results)
    if(hsProjects.paging) {
      return getDeals(hsProjects.paging.next.after, limit, projectList)
    }
    else {
      return projectList
    }
  } catch (e) {
    console.error(e)
  }
}

// Recursively fetch all project associations (contacts, notes, etc.)
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

// Takes a HubSpot response and reformats the keys
function formatProjectObject(project) {

  // Format project object ready for manipulation
  let projectProperties = project.properties
  delete project.properties

  project = { ...project, ...projectProperties }
  project.contacts = []
  project.notes = []

  // Set correct dealstage name from key
  project.dealstage = formatDealStage(project.dealstage)

  // Remove HubSpot properties - prefixed 'hs_'
  delete project.hs_lastmodifieddate
  delete project.hs_object_id

  // Remove duplicate creation date property
  delete project.createdate

  return camelcaseKeys(project)
}

function createStrapiProject(hubspotProject) {
  if (['Completed', 'Allocated', 'Awaiting Allocation'].includes(hubspotProject.dealstage)) {
    console.error(`Project ${hubspotProject.dealname} not found in Strapi database`)
    // Get or create the Clockify project
    strapi.service('api::timesheet.timesheet').createClockifyProject(camelcaseKeys(hubspotProject)).then(clockifyProject => {
      // Create the entry in Strapi to link Hubspot and Clockify
      strapi.entityService.create('api::project.project', {
        data: {
          name: hubspotProject.dealname,
          hubspotID: hubspotProject.id,
          clockifyID: clockifyProject.id
        }
      }).catch(error => {
        console.log('Error creating ' + hubspotProject.dealname)
        console.error(error.details.errors)
      })
    }).catch(error => {
      console.log('Error creating ' + hubspotProject.dealname)
      console.error(error)
    })
  }
  else {
    console.error('Too early in lifecycle to create a project')
  }
}

module.exports = createCoreService('api::project.project', ({ strapi }) =>  ({

  async find(...args) { 
    let params = args[0]

    let hubspotDealStages = []

    params.dealstage.forEach(stage => {
      hubspotDealStages.push(stages[camelcase(stage)])
    })

    let response = await getDeals(0, 100, hubspotDealStages, [])

    let projects = []

    response.forEach(project => {
      projects.push(formatProjectObject(project))
    })

    let projectIDs = []
    projects.map(project => project.id).forEach(projectId => {
      projectIDs.push({ id: projectId })
    })

    let contactAssociationsResponse = await hubspotClient.crm.associations.batchApi.read('deal', 'contact', { inputs: projectIDs })
    let noteAssociationsResponse = await hubspotClient.crm.associations.batchApi.read('deal', 'engagements', { inputs: projectIDs })

    const contactAssociations = contactAssociationsResponse.results.map(association => association.to).flat(1)
    const contactIDs = contactAssociations.map(contact => contact.id)
    const contacts = await getAssociations('contacts', 0, 100, contactProperties, contactIDs, [])

    const noteAssociations = noteAssociationsResponse.results.map(association => association.to).flat(1)
    const noteIDs = noteAssociations.map(note => note.id)
    const notes = await getAssociations('notes', 0, 100, noteProperties, noteIDs, [])

    projects.forEach(project => {

      let contactAssociation = contactAssociationsResponse.results.filter((association) => {
        return association._from.id === project.id
      })

      let projectContacts = []

      if(contactAssociation.length) {

        let contactIDs = contactAssociation[0].to.map(association => association.id)

        contacts.filter((contact) => {
          return contactIDs.includes(contact.id)
        }).forEach(contact => {
          let contactProperties = contact.properties
          contact = { ...contact, ...contactProperties }
          delete contact.properties
          delete contact.hs_object_id
          delete contact.createdate
          delete contact.lastmodifieddate

          projectContacts.push(contact)
        })
      }

      project.contacts = projectContacts

      let noteAssociation = noteAssociationsResponse.results.filter((association) => {
        return association._from.id === project.id
      })

      let projectNotes = []

      if(noteAssociation.length) {
        let noteIDs = noteAssociation[0].to.map(association => association.id)

        notes.filter((note) => {
          return noteIDs.includes(note.id)
        }).forEach(note => {
          let noteProperties = note.properties
          note = { ...note, ...noteProperties }
          delete note.properties
          delete note.hs_object_id
          delete note.createdate
          delete note.lastmodifieddate
  
          projectNotes.push(note)
        })
      }

      project.notes = projectNotes
    })

    return projects
  },

  async findOld(...args) {  

    let params = args[0]

    let { results, pagination } = await super.find(...args)

    const sort = JSON.stringify({
      propertyName: "dealname",
      direction: "ASCENDING",
    })
    const limit = 100
    const after = 0

    let hsProjects = await getDeals(after, limit, [])

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
          createStrapiProject(result)
        }

        results.push(camelcaseKeys(result))
    })

    pagination.page = 1
    pagination.pageCount = 1
    pagination.pageSize = results.length
    pagination.total = results.length

    return { results, pagination }
  },

  async findOne(projectID) {

    // let response = await hubspotClient.crm.deals.searchApi.doSearch(publicObjectSearchRequest)
    return hubspotClient.crm.deals.basicApi.getById(projectID, dealProperties, null, ['contacts', 'notes']).then(async (project) => {

      project = formatProjectObject(project)

      // Add project contacts
      if(project.associations.contacts) {
        let contacts = await getAssociations('contacts', 0, 100, contactProperties, project.associations.contacts.results.map(contact => contact.id), [])
      
        contacts.forEach(contact => {
          let contactProperties = contact.properties
          delete contact.properties
          project.contacts.push({...contact, ...contactProperties})
        })
      }

      // Add project notes
      if(project.associations.notes) {
        let notes = await getAssociations('notes', 0, 100, noteProperties, project.associations.notes.results.map(note => note.id), [])
      
        notes.forEach(note => {
          let noteProperties = note.properties
          delete note.properties
          project.notes.push({...note, ...noteProperties})
        })
      }

      delete project.associations

      // Fetch existing Strapi project
      const strapiProjects = await super.find({ filters: { hubspotID: projectID }})

      // Strapi project exists, attach Clockify ID
      if(strapiProjects.results.length === 1) {
        project.clockifyID = strapiProjects.results[0].clockifyID
      }
      // Strapi project doesn't exist, create it
      else if(strapiProjects.results.length === 0) {
        console.log('Strapi Project doesn\'t exist')
        createStrapiProject(project)
      }
      // Only possible if duplicate HubspotIDs in the database, schema makes this impossible
      else {
        console.error('More than two projects found - impossible!')
      }

      return project
    }).catch((err) => {
      if(err.code !== 404) {
        console.error(err)
      }
      console.error(err)
      return null
    })
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