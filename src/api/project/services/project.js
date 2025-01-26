'use strict';

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
let axios = require('axios')

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

async function createClockifyProject(hsProject) {
  return new Promise(async (resolve, reject) => {
      try {

          if (hsProject.contacts.length === 0) {
              throw new Error('Project has no contacts')
          }

          const contact = hsProject.contacts[0]

          const projectName = hsProject.dealname,
                projectOwner = `${contact.firstname} ${contact.lastname}`

          let clientRequest = {
              params: {
                  name: projectOwner,
                  'page-size': 200,
              },
          }
          let projectRequest = {
              params: {
                  name: projectName,
                  'page-size': 200,
              },
          }
          let clientConfig = { ...apiConfig, ...clientRequest }
          let projectConfig = { ...apiConfig, ...projectRequest }
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
                  apiConfig
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

              const newProject = await axios.post(`/projects`, project, apiConfig)

              if (hsProject.lineItems.length !== 0) {
                  // Convert days to hours
                  const hours = Math.floor(hsProject.lineItems[0].quantity * 7.4)

                  const estimate = {
                      timeEstimate: {
                          estimate: `PT${hours}H`,
                          type: 'MANUAL',
                          resetOption: null,
                          active: true,
                          includeNonBillable: true
                      }
                  }

                  await axios.patch(`/projects/${newProject.data.id}/estimate`, estimate, apiConfig)
              }

              resolve(newProject)
          } else {
              resolve(response.data[0])
          }
      } catch (error) {
          reject(error.response ? error.response.data : error)
      }
  })
}

module.exports = createCoreService('api::project.project', ({ strapi }) =>  ({
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
                result.estimate = clockifyProject.estimate.estimate
                result.spent = clockifyProject.duration
            }
            catch (e) {
                console.log(result)
            }
        })
    
        return { results, pagination }
    },
    async createFromHubspot(hubspotID) {
      console.log(`Creating project from Hubspot: ${hubspotID}`)
      const deal = await hubspotClient.crm.deals.basicApi.getById(hubspotID, dealProperties, null, ['contacts', 'line_items', 'notes'])

      const contactCalls = [],
            lineItemCalls = [],
            noteCalls = []

      if(deal.associations.contacts?.results.length) {
        for(const contact of deal.associations.contacts.results) {
          contactCalls.push(hubspotClient.crm.contacts.basicApi.getById(contact.id))
        }
      }

      if(deal.associations.lineItems?.results.length) {
        for(const lineItem of deal.associations.lineItems.results) {
          lineItemCalls.push(hubspotClient.crm.lineItems.basicApi.getById(lineItem.id))
        }
      }

      if(deal.associations.notes?.results.length) {
        for(const note of deal.associations.notes.results) {
          noteCalls.push(hubspotClient.crm.notes.basicApi.getById(note.id))
        }
      }

      const [contacts, lineItems, notes] = await Promise.all([Promise.all(contactCalls), Promise.all(lineItemCalls), Promise.all(noteCalls)])

      deal.contacts = contacts.map(contact => contact.properties)
      deal.lineItems = lineItems.map(lineItem => lineItem.properties)
      deal.notes = notes.map(note => note.properties)

      console.log(deal)

      return hubspotID
    }
}))