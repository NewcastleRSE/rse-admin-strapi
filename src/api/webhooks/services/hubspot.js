'use strict';

const camelcase = require('camelcase')
const DateTime = require('luxon').DateTime
const { setupCache } = require('axios-cache-interceptor')
let axios = require('axios')
const Hubspot = require('@hubspot/api-client')
const hubspotClient = new Hubspot.Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN })

const instance = axios.create()
axios = setupCache(instance, {
    methods: ['get', 'post']
})

const clockifyConfig = {
    baseURL: `https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`,
    headers: {
        'X-Api-Key': process.env.CLOCKIFY_KEY
    },
    cache: {
        maxAge: 60 * 60 * 1000
    }
}

const strapiConfig = {
    baseURL: 'http://localhost:8080/api',
    headers: {
        Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`
    }
}

const stages = {
  meetingScheduled: process.env.HUBSPOT_DEAL_MEETING_SCHEDULED,
  bidPreparation: process.env.HUBSPOT_DEAL_BID_PREPARATION,
  grantWriting: process.env.HUBSPOT_DEAL_GRANT_WRITING,
  submittedToFunder: process.env.HUBSPOT_DEAL_SUBMITTED_TO_FUNDER,
  notFunded: process.env.HUBSPOT_DEAL_NOT_FUNDED,
  awaitingAllocation: process.env.HUBSPOT_DEAL_FUNDED_AWAITING_ALLOCATION,
  allocated: process.env.HUBSPOT_DEAL_ALLOCATED,
  completed: process.env.HUBSPOT_DEAL_COMPLETED
}

const propertyMap = {
  account_code: 'account',
  amount: 'amount',
  award_stage: 'awardStage',
  cost_model: 'costModel',
  dealname: 'name',
  dealstage: 'stage',
  end_date: 'endDate',
  faculty: 'faculty',
  finance_contact: 'financeContact',
  funding_body: 'funder',
  hs_object_id: 'hsObjectId',
  project_value: 'value',
  school: 'school',
  start_date: 'startDate',
  nu_projects_number: 'nuProjects',
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
      console.error(`${stage} is not in ${hsStages}`)
      return stage
  }
}

/**
 * A set of functions called "actions" for `webhooks`
 */

module.exports = {
  createProject: async(hubspotId) => {
    try {
      return await strapi.service('api::project.project').createFromHubspot(hubspotId)
    }
    catch (err) {
      throw err
    }
  },
  updateProject: async(hubspotId, propertyName, propertyValue) => {
    try {
      const project = await strapi.documents('api::project.project').findFirst({ filters: { hubspotID: hubspotId } })
      if(project) {
        let strapiUpdates = {}, clockifyUpdates = {}

        // If the property is a date, convert it to ISO format
          if(propertyName === 'start_date' || propertyName === 'end_date') {
            strapiUpdates[propertyMap[propertyName]] = DateTime.fromMillis(Number(propertyValue)).toISODate()
          }
          // If the property is dealname, prepare Clockify update
          else if(propertyName === 'dealname') {
            strapiUpdates[propertyMap[propertyName]] = propertyValue
            clockifyUpdates = { name: strapiUpdates }
          }
          // If the property is dealstage, map it to the correct stage name and prepare Clockify update
          else if(propertyName === 'dealstage') {

            const stage = formatDealStage(propertyValue)

            if(!stage) {
              throw new Error(`Invalid deal stage: ${propertyValue}`)
            }
            else {
              strapiUpdates[propertyMap[propertyName]] = stage

              // If the stage is anything other than in progress, archive the project in Clockify
              if(stage === 'Awaiting Allocation' || stage === 'Allocated') {
                clockifyUpdates = { archived: true }
              }
              else {
                clockifyUpdates = { archived: true }
              }
            }
          }
          // Otherwise, just set the value
          else {
            strapiUpdates[propertyMap[propertyName]] = propertyValue
          }

          if(Object.keys(clockifyUpdates).length && project.clockifyID) {
            const response = await axios.put(`/projects/${project.clockifyID}`, clockifyUpdates, clockifyConfig)
            if(response.status !== 200) {
              throw new Error(`Error updating Clockify project: ${response.statusText}`)
            }
          }

          // Update the project with the new data
          return await strapi.documents('api::project.project').update({ 
              documentId: project.documentId,
              data: strapiUpdates
          })
      }
      // If the project does not exist, create it
      else {
        return this.createProject(hubspotId)
      }
    } catch (err) {
      throw err
    }
  },
  updateContact: async(hubspotId, contactId, associationRemoved) => {
    try {
      const project = await strapi.documents('api::project.project').findFirst(
        { 
          filters: { hubspotID: hubspotId },
          populate: { contacts: true }
        }
      )
      if(project) {

        let hubspotContact

        let contactProperties = ['firstname', 'lastname', 'email', 'company', 'jobtitle', 'department']

        try {
          hubspotContact = (await hubspotClient.crm.contacts.basicApi.getById(contactId, contactProperties)).properties
        } catch (error) {
          throw error
        }

        let contact = await strapi.documents('api::contact.contact').findFirst({ filters: { hubspotID: contactId } })

        // If the contact does not exist in Strapi, create it
        if(!contact) {

          const newContactData = {
              firstname: hubspotContact.firstname,
              lastname: hubspotContact.lastname,
              displayName: `${hubspotContact.firstname} ${hubspotContact.lastname}`,
              email: hubspotContact.email,
              jobTitle: hubspotContact.jobtitle,
              organisation: hubspotContact.company,
              department: hubspotContact.department,
              hubspotID: contactId
            }

          try {
            contact = await strapi.documents('api::contact.contact').create({data: newContactData })
          } catch (error) {
            throw error
          }
        }

        let contactList

        if(associationRemoved) {
          contactList = project.contacts.filter(c => c.documentId !== contact.documentId)
        } else {
          contactList = [...project.contacts.map(c => c.documentId), contact.documentId]
        }

        // Update the project with the new contact list
        return await strapi.documents('api::project.project').update({ 
          documentId: project.documentId,
          data: { contacts: contactList },
          populate: { contacts: true }
        })
      } 
    }
    catch (err) {
      throw err
    }
  },
  updateLineItems: async(hubspotId, LineItemId) => {
    return true
  },
  deleteProject: async(hubspotId) => {
    try {
      const project = await strapi.documents('api::project.project').findFirst({ filters: { hubspotID: hubspotId } })
      if(project) {
        await strapi.documents('api::project.project').delete({ documentId: project.documentId })
        return true
      } else {
        return false
      }
    }
    catch (err) {
      throw err
    }
  }
}
