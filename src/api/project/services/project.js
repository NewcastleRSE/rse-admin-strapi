'use strict';

const fs = require('fs')
const DateTime = require('luxon').DateTime
const Duration = require('luxon').Duration
const Hubspot = require('@hubspot/api-client')
const hubspotClient = new Hubspot.Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })
const dealProperties = process.env.HUBSPOT_DEAL_PROPERTIES.split(','),
  contactProperties = process.env.HUBSPOT_CONTACT_PROPERTIES.split(','),
  lineItemProperties = process.env.HUBSPOT_LINE_ITEM_PROPERTIES.split(',')
/**
 * project service.
 */

const { createCoreService } = require('@strapi/strapi').factories;
const { setupCache } = require('axios-cache-interceptor')
let axios = require('axios');
const { arch } = require('os');

const instance = axios.create()
axios = setupCache(instance, {
  methods: ['get']
})

const clockifyConfig = {
  baseURL: `https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`,
  headers: {
    'X-Api-Key': process.env.CLOCKIFY_KEY,
  },
  cache: {
    maxAge: 60 * 60 * 1000
  }
}

const stages = {
  awaitingAllocation: process.env.HUBSPOT_DEAL_FUNDED_AWAITING_ALLOCATION,
  allocated: process.env.HUBSPOT_DEAL_ALLOCATED,
  completed: process.env.HUBSPOT_DEAL_COMPLETED,
}

// Invert stages to key by HubSpot stage names
const invert = (obj) => Object.fromEntries(Object.entries(obj).map((a) => a.reverse()))
const hsStages = invert(stages)

function formatDealStage(stage) {
  if (stage && hsStages[stage]) {
    return hsStages[stage]
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, function (str) {
        return str.toUpperCase()
      })
  } else {
    throw new Error(`${stage} is not in ${Object.keys(hsStages).join(', ')}`)
  }
}

// Recursively fetch HubSpot deals
async function getDeals(after = 0, limit = 100, projectList = []) {
  try {
    const publicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            { propertyName: 'dealstage', operator: 'IN', values: Object.keys(hsStages) },
          ],
        },
      ],
      properties: dealProperties,
      limit,
      after,
    }

    let hsProjects = await hubspotClient.crm.deals.searchApi.doSearch(publicObjectSearchRequest)
    projectList = projectList.concat(hsProjects.results)

    if (hsProjects.paging) {
      return getDeals(
        hsProjects.paging.next.after,
        limit,
        projectList
      )
    } else {
      return projectList
    }
  } catch (e) {
    console.error(e)
  }
}

// Recursively fetch all HubSpot contacts
async function getContacts(ids, after = 0, limit = 100, contactList = []) {
  try {
    const publicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            { propertyName: 'hs_object_id', operator: 'IN', values: ids },
          ],
        },
      ],
      properties: contactProperties,
      limit,
      after,
    }

    let hsContacts = await hubspotClient.crm.contacts.searchApi.doSearch(publicObjectSearchRequest)
    contactList = contactList.concat(hsContacts.results)

    if (hsContacts.paging) {
      return getContacts(
        ids,
        hsContacts.paging.next.after,
        limit,
        contactList
      )
    } else {
      return contactList
    }
  } catch (e) {
    console.error(e)
  }
}

// Recursively fetch all project associations (contacts, notes, etc.)
async function getHubSpotAssociations(
  association,
  after,
  limit,
  properties,
  ids,
  associationList
) {
  try {
    const publicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_object_id", operator: "IN", values: ids },
          ],
        },
      ],
      properties,
      limit,
      after,
    }

    let hsAssociations

    if (association === "contacts") {
      hsAssociations = await hubspotClient.crm.contacts.searchApi.doSearch(
        publicObjectSearchRequest
      )
      associationList = associationList.concat(hsAssociations.results)
    } else if (association === "notes") {
      hsAssociations = await hubspotClient.crm.objects.notes.searchApi.doSearch(
        publicObjectSearchRequest
      )
      associationList = associationList.concat(hsAssociations.results)
    } else if (association === "lineItems") {
      hsAssociations = await hubspotClient.crm.lineItems.searchApi.doSearch(
        publicObjectSearchRequest
      )
      associationList = associationList.concat(hsAssociations.results)
    } else {
      console.error("Invalid association type")
    }

    if (hsAssociations.paging) {
      return getHubSpotAssociations(
        association,
        hsAssociations.paging.next.after,
        limit,
        properties,
        ids,
        associationList
      )
    } else {
      return associationList
    }
  } catch (e) {
    if (e.code === 429) {
      await sleep(10000)
      return getHubSpotAssociations(
        association,
        after,
        limit,
        properties,
        ids,
        associationList
      )
    }
    else {
      console.error(e)
    }
  }
}

async function createClockifyProject(hsProject) {
  return new Promise(async (resolve, reject) => {
    try {

      if (hsProject.properties.contacts.length === 0) {
        throw new Error('Project has no contacts')
      }

      const contact = hsProject.properties.contacts[0].properties

      const projectName = hsProject.properties.dealname,
        projectOwner = `${contact.firstname} ${contact.lastname}`

      let clientRequest = {
        params: {
          name: projectOwner,
          hydrated: true,
          'page-size': 5000,
        },
      }
      let projectRequest = {
        params: {
          name: projectName,
          hydrated: true,
          'page-size': 5000,
        },
      }
      let clientConfig = { ...clockifyConfig, ...clientRequest }
      let projectConfig = { ...clockifyConfig, ...projectRequest }
      let response = await axios.get(`/clients`, clientConfig)
      let clientId = null

      // Client does not exist, create a new one
      if (!response.data || !response.data.length) {
        response = await axios.post(
          `/clients`,
          {
            name: projectOwner,
            note: '',
          },
          clockifyConfig
        )
        clientId = response.data.id
      } else {
        clientId = response.data[0].id
      }

      response = await axios.get(`/projects`, projectConfig)

      // Clockify project doesn't exist, create it
      if (!response.data || !response.data.length) {
        let project = {
          name: projectName,
          clientId: clientId,
          isPublic: true,
          billable: true,
          public: true
        }

        const newProject = await axios.post(`/projects`, project, clockifyConfig)

        if (hsProject.properties.lineItems.length !== 0) {
          // Convert days to hours
          const hours = Math.floor(hsProject.properties.lineItems[0].quantity * 7.4)

          const estimate = {
            timeEstimate: {
              estimate: `PT${hours}H`,
              type: 'MANUAL',
              resetOption: null,
              active: true,
              includeNonBillable: true
            }
          }

          await axios.patch(`/projects/${newProject.data.id}/estimate`, estimate, clockifyConfig)
        }

        resolve(newProject.data)
      } else {
        resolve(response.data[0])
      }
    } catch (error) {
      reject(error.response ? error.response.data : error)
    }
  })
}

module.exports = createCoreService('api::project.project', ({ strapi }) => ({
  async find(...args) {
    // Calling the default core service
    const { results, pagination } = await super.find(...args)

    const clockifyIDs = results.map(p => p.clockifyID)

    // Calling Clockify
    const response = await axios.get('/projects?hydrated=true&page-size=5000', clockifyConfig)

    // Filtering the clockify projects that are in the project list
    const clockifyProjects = response.data.filter(p => clockifyIDs.includes(p.id))

    results.forEach(result => {
      try {
        const clockifyProject = clockifyProjects.find(p => p.id === result.clockifyID)
        result.estimate = clockifyProject?.estimate?.estimate
        result.spent = clockifyProject?.duration
        result.anticipatedProgress = 'PT0S'

        // calculate expected progress based on assignments, if there is an estimate
        if (result.estimate && result.estimate !== 'PT0S' && result.assignments.length != 0) {
        console.log(result)

        // number of days scheduled between today and end date
        let fullDays = 0
        let scheduled = 0 
        result.assignments.forEach(assignment => {
          // if todays date is between assignment.start and assignment.end (yyyy-mm-dd), count the days between today and assignment.end that are working days and multiple this by 
          // the FTE of the assignment
          // note this does not account for bank holidays or scheduled leave
          const today = DateTime.now().startOf('day'),
          assignmentStart = DateTime.fromISO(assignment.start).startOf('day'),
          assignmentEnd = DateTime.fromISO(assignment.end).startOf('day')

          // include if the assignment is currently ongoing or yet to commence
          if (today <= assignmentEnd) {
            // if assignment has not started, count from the start date, else use today's date
            let currentDate = today < assignmentStart ? assignmentStart : today
          
            
            while (currentDate <= assignmentEnd) {
              // check if currentDate is a working day (Mon-Fri)
              if (currentDate.weekday < 6) {
                fullDays += 1
              }
              currentDate = currentDate.plus({ days: 1 })
            }
            
            console.log(`Assignment has ${fullDays} working days remaining at FTE ${assignment.fte}`)
            scheduled += (fullDays * (assignment.fte/100))
          }
        })

console.log(`Project ${result.name} has ${scheduled} scheduled days remaining.`)

        // convert from ISO 8601 duration format to hours
        const estimateDuration = Duration.fromISO(result.estimate)
        const estimateHours = estimateDuration.as('hours')

        // convert scheduled days to hours, based on 7.4 hours per day
        const scheduledHours = scheduled * 7.4
        
        // calculate anticipated progress
  

        // anticipated progress needed to complete project using the scheduled days
        result.anticipatedProgress =  estimateDuration.minus(Duration.fromObject({ hours: scheduledHours })).toISO()
        console.log(`Project ${result.name} has an anticipated progress of ${result.anticipatedProgress} based on ${scheduledHours} scheduled hours remaining out of ${estimateHours} estimated hours.`)
      }
      }
      catch (error) {
        console.error(error)
        console.error(result)
      }
    })

    return { results, pagination }
  },
  async createFromHubspot(hubspotID) {

    // Get deal from HubSpot
    const deal = await hubspotClient.crm.deals.basicApi.getById(hubspotID, dealProperties, [], ['contacts', 'line_items', 'notes'])

    if (deal) {
      try {
        deal.properties.dealstage = formatDealStage(deal.properties.dealstage)
      }
      catch (error) {
        throw new Error('Deal not at a valid stage')
      }
    }

    if (!deal.associations || !deal.associations.contacts) {
      throw new Error('Deal has no contacts')
    }

    // Populate contacts
    if (deal.associations.contacts?.results.length) {
      deal.properties.contacts = await getHubSpotAssociations('contacts', null, 100, contactProperties, deal.associations.contacts.results.map(contact => contact.id), [])
    }

    // Populate line items
    if (deal.associations['line items']?.results.length) {
      deal.properties.lineItems = await getHubSpotAssociations('lineItems', null, 100, lineItemProperties, deal.associations['line items'].results.map(lineItem => lineItem.id), [])
    }

    // Populate notes
    if (deal.associations.notes?.results.length) {
      deal.properties.notes = await getHubSpotAssociations('notes', null, 100, ['content'], deal.associations.notes.results.map(note => note.id), [])
    }

    // clean up associations
    delete deal.associations

    // Get contact emails
    const contactEmails = deal.properties.contacts.map(contact => contact.properties.email)

    // Get existing contacts
    const strapiContacts = (await strapi.documents('api::contact.contact').findMany({ filters: { email: contactEmails } }))

    // Get new contact emails
    const newContacts = strapiContacts ? deal.properties.contacts.filter(contact => !strapiContacts.map(contact => contact.email).includes(contact.properties.email)) : []

    // Create Clockify project
    const clockifyProject = await createClockifyProject(deal)

    const contactIDs = strapiContacts.map(contact => contact.documentId)

    try {
      for (const contact of newContacts) {

        const newContact = {
          email: contact.properties.email,
          firstname: contact.properties.firstname,
          lastname: contact.properties.lastname,
          displayName: contact.properties.firstname + ' ' + contact.properties.lastname,
          jobTitle: contact.properties.jobtitle,
          department: contact.properties.department,
          hubspotID: contact.id
        }

        contactIDs.push((await strapi.services['api::contact.contact'].create({ data: newContact })).id)
      }
    } catch (err) {
      console.error(err)
    }

    // Empty response object
    let response

    try {

      const project = {
        name: deal.properties.dealname,
        hubspotID: deal.id,
        clockifyID: clockifyProject.id,
        condition: 'green',
        stage: deal.properties.dealstage,
        costModel: deal.properties.cost_model,
        awardStage: deal.properties.award_stage,
        startDate: DateTime.fromMillis(Number(deal.properties.start_date)).toISODate(),
        endDate: DateTime.fromMillis(Number(deal.properties.end_date)).toISODate(),
        funder: deal.properties.funding_body,
        school: deal.properties.school,
        faculty: deal.properties.faculty,
        amount: deal.properties.amount,
        value: deal.properties.project_value,
        financeContact: deal.properties.finance_contact,
        account: deal.properties.account,
        nuProjects: deal.properties.nu_projects_number,
        contacts: contactIDs
      }

      let missingFields = []

      // Check if all required fields are present
      if (!project.name) missingFields.push('Name')
      if (!project.clockifyID) missingFields.push('ClockifyID')
      if (!project.hubspotID) missingFields.push('HubspotID')
      if (!project.stage) missingFields.push('Stage')
      if (!project.costModel) missingFields.push('Cost Model')
      if (!project.awardStage) missingFields.push('Award Stage')
      if (!project.faculty) missingFields.push('Faculty')
      if (!project.contacts.length) missingFields.push('Contacts')

      if (missingFields.length) {
        throw new Error('Missing required fields: ' + missingFields.join(', '))
      }
      else {
        response = await strapi.services['api::project.project'].create({ data: project })
      }
    }
    catch (error) {
      console.error(error)
      throw error
    }

    return response
  },
  async sync() {

    try {

      const output = {
        created: [],
        updated: [],
        errors: []
      }

      // Get all projects from HubSpot
      const hubspotProjects = await getDeals()
      const projectIDs = hubspotProjects.map(p => p.id)

      // Get all Clockify projects and clients
      const clockifyAllProjects = (await axios.get('/projects?page-size=5000', clockifyConfig)).data,
            clockifyAllClients = (await axios.get('/clients?page-size=5000', clockifyConfig)).data,
            clockifyProjectClientIDs = [...new Set(clockifyAllProjects.map(p => p.clientId))]

      // Get all projects from Strapi
      const strapiProjects = await strapi.documents('api::project.project').findMany({ filters: { hubspotID: { $in: projectIDs } }, fields: ['hubspotID'], populate: { contacts: true } })

      // Separate out new and existing project IDs
      const newProjects = hubspotProjects.filter(hsProject => !strapiProjects.find(sp => sp.hubspotID === hsProject.id)).map(p => p.id)
      const existingProjects = hubspotProjects.filter(hsProject => strapiProjects.find(sp => sp.hubspotID === hsProject.id)).map(p => p.id)

      // Get Hubspot contacts for all projects
      const associations = await hubspotClient.crm.associations.batchApi.read('deals', 'contacts', { inputs: projectIDs.map(id => ({ id })) })

      if (associations.errors > 0) {
        // Report Errors
        console.error('Errors fetching associations:', associations.results.filter(r => r.errors).map(r => ({ id: r.id, errors: r.errors })))
      }

      // Get unique contact IDs
      const contactIDs = [...new Set(associations.results.flatMap(r => r.to.map(t => t.id)))]

      // Fetch contacts in chunks of 100 (HubSpot limit)
      const chunkSize = 100
      let contacts = []

      for (let i = 0; i < contactIDs.length; i += chunkSize) {
        const chunk = contactIDs.slice(i, i + chunkSize)
        contacts = contacts.concat(await getContacts(chunk))
      }

      const contactMap = [],
            ProjectMap = []

            let unconnectedClockifyProjects = 0,
            archivedProjects = 0,
            removedProjects = 0

            const defaultClockifyProjects = process.env.DEFAULT_CLOCKIFY_PROJECTS ? process.env.DEFAULT_CLOCKIFY_PROJECTS.split(',') : []

      for (const project of clockifyAllProjects) {
        if(defaultClockifyProjects.includes(project.name)) {
          // Always keep default projects
          continue
        }
        const hsProject = hubspotProjects.find(p => p.properties.dealname === project.name)
        if (hsProject) {
          ProjectMap.push({
            clockifyID: project.id,
            hubspotID: hsProject.id,
            name: project.name
          })
        } else {
          // Project not in HubSpot, consider removing
          unconnectedClockifyProjects++

          // Has no time logged and no estimate, so can be removed
          if(project.duration === 'PT0S' && (!project.estimate || project.estimate?.estimate === 'PT0S')) {
            removedProjects++

            if(!project.archived) {
              archivedProjects++
              // Archive project before deletion
              await axios.put(`/projects/${project.id}`, { archived: true }, clockifyConfig)
            }

            await axios.delete(`/projects/${project.id}`, clockifyConfig)
          }
          else {
            console.log(`Clockify project ${project.name} has time logged or an estimate, so cannot be removed.`)
          }

          if(unconnectedClockifyProjects % 20 === 0) {
            console.log(`${unconnectedClockifyProjects} Clockify projects checked so far...Sleeping for 2 seconds to avoid rate limits.`)
            await new Promise(r => setTimeout(r, 2000)) // Sleep to avoid rate limits
          }
        }
      }

      for (const client of clockifyAllClients) {

        const hsContact = contacts.find(c => c.properties.firstname + ' ' + c.properties.lastname === client.name)

        // Delete clients that are not associated with any clockify projects
        if (!clockifyProjectClientIDs.includes(client.id) && !hsContact) {
          await axios.delete(`/clients/${client.id}`, clockifyConfig)
        }
        else if (hsContact) {
          // Update client with email address
          await axios.put(`/clients/${client.id}`, { 
            name: client.name,
            email: hsContact.properties.email
          }, clockifyConfig)

          contactMap.push({
            clockifyID: client.id,
            hubspotID: hsContact.id,
            email: hsContact.properties.email,
            name: client.name
          })
        }
        else {
          console.log(`No HubSpot contact found for Clockify client ${client.name}`)
        }
      }

      for (const hsProject of hubspotProjects) {

        try {
          // Set deal stage to formatted value
          hsProject.properties.dealstage = formatDealStage(hsProject.properties.dealstage)

          // Find associated contacts
          const associatedContacts = associations.results.filter(r => r._from.id === hsProject.id)

          hsProject.properties.contacts = []

          if (associatedContacts && associatedContacts.length) {

            // Find contact IDs
            let contactIDs = associatedContacts.map(a => a.to.map(t => t.id)).flat()

            // Add contacts to project
            hsProject.properties.contacts = contacts.filter(c => contactIDs.includes(c.id))
          }

          let contactRelations = []

          for (const hsContact of hsProject.properties.contacts) {

            const strapiContact = {
              email: hsContact.properties.email,
              firstname: hsContact.properties.firstname,
              lastname: hsContact.properties.lastname,
              displayName: hsContact.properties.firstname + ' ' + hsContact.properties.lastname,
              jobTitle: hsContact.properties.jobtitle,
              department: hsContact.properties.department,
              hubspotID: hsContact.id,
              clockifyID: contactMap.find(c => c.hubspotID === hsContact.id)?.clockifyID || null
            }

            const existingContact = await strapi.documents('api::contact.contact').findFirst({ filters: { email: strapiContact.email } })

            if (existingContact) {
              // Update existing contact
              await strapi.documents('api::contact.contact').update(existingContact.id, strapiContact)
              contactRelations.push(existingContact.id)
            } else {
              // Create new contact
              const newContact = await strapi.documents('api::contact.contact').create({ data: strapiContact })
              contactRelations.push(newContact.id)
            }
          }

          let clockifyProjectID = ProjectMap.find(p => p.hubspotID === hsProject.id)?.clockifyID

          if (!clockifyProjectID) {

            const contactMapEntry = contactMap.find(c => c.hubspotID === hsProject.properties.contacts[0]?.id)

            if (!contactMapEntry) {

              // Create Clockify client
              const clockifyClient = await axios.post('/clients', { 
                name: hsProject.properties.contacts[0]?.properties.firstname + ' ' + hsProject.properties.contacts[0]?.properties.lastname,
                email: hsProject.properties.contacts[0]?.properties.email
              }, clockifyConfig)

              // Add to contact map
              contactMap.push({
                clockifyID: clockifyClient.data.id,
                hubspotID: hsProject.properties.contacts[0]?.id,
                email: hsProject.properties.contacts[0]?.properties.email,
                name: hsProject.properties.contacts[0]?.properties.firstname + ' ' + hsProject.properties.contacts[0]?.properties.lastname
              })

              // Use this new entry
              contactMapEntry = contactMap.find(c => c.hubspotID === hsProject.properties.contacts[0]?.id)
            }

            // Create Clockify project

            const payload = { 
              name: hsProject.properties.dealname,
              clientId: contactMapEntry.clockifyID,
              isPublic: true,
              billable: true
            }

            const clockifyProject = await axios.post('/projects', payload, clockifyConfig)

            clockifyProjectID = clockifyProject.data.id
          }

          // Create project in Strapi
          const project = {
            name: hsProject.properties.dealname,
            hubspotID: hsProject.id,
            clockifyID: clockifyProjectID,
            condition: hsProject.properties.dealstage === 'Awaiting Allocation' ? 'amber' : 'green',
            stage: hsProject.properties.dealstage,
            costModel: hsProject.properties.cost_model,
            awardStage: hsProject.properties.award_stage,
            startDate: DateTime.fromMillis(Number(hsProject.properties.start_date)).toISODate(),
            endDate: DateTime.fromMillis(Number(hsProject.properties.end_date)).toISODate(),
            funder: hsProject.properties.funding_body,
            school: hsProject.properties.school,
            faculty: hsProject.properties.faculty,
            amount: hsProject.properties.amount,
            value: hsProject.properties.project_value,
            financeContact: hsProject.properties.finance_contact,
            account: hsProject.properties.account,
            nuProjects: hsProject.properties.nu_projects_number,
            contacts: contactRelations
          }

          let missingFields = []

          // Check if all required fields are present
          if (!project.name) missingFields.push('Name')
          if (!project.clockifyID) missingFields.push('ClockifyID')
          if (!project.hubspotID) missingFields.push('HubspotID')
          if (!project.stage) missingFields.push('Stage')
          if (!project.costModel) missingFields.push('Cost Model')
          if (!project.awardStage) missingFields.push('Award Stage')
          if (!project.faculty) missingFields.push('Faculty')
          if (!project.contacts.length) missingFields.push('Contacts')

          if (missingFields.length) {
            throw new Error('Missing required fields: ' + missingFields.join(', '))
          }

          if (existingProjects.includes(hsProject.id)) {

              // Retrieve existing project
              const existingProject = await strapi.documents('api::project.project').findFirst({ filters: { hubspotID: hsProject.id } })

              // Update existing project
              const response = await strapi.documents('api::project.project').update({ documentId: existingProject.documentId, data: project })

              // Add to output
              output.updated.push({
                name: response.name,
                documentId: response.documentId,
                hubspotID: response.hubspotID,
                clockifyID: response.clockifyID
              })

          } else {
              // Create new project
              const response = await strapi.documents('api::project.project').create({ data: project })

              // Add to output
              output.created.push({
                name: response.name,
                documentId: response.documentId,
                hubspotID: response.hubspotID,
                clockifyID: response.clockifyID
              })
          }

        } catch (error) {

          let errorOutput = []

          if (error.details && error.details.errors) {
            errorOutput = errorOutput.concat(error.details.errors)
          }
          else {
            errorOutput.push(error.message)
          }

          output.errors.push({ name: hsProject.properties.dealname, hubspotID: hsProject.id, error: errorOutput })
        }
      }

      return output
    } catch (error) {
      console.error(error)
      throw error
    }
  }
}))