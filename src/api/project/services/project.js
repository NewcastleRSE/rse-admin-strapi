'use strict';

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
      return hubspotID
    }
}))