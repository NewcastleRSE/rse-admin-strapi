'use strict'

/**
 * timesheet service.
 */

const axios = require('axios')
const axiosConfig = {
    baseURL: 'https://api.clockify.me/api/v1',
    headers: {
        'X-Api-Key': process.env.CLOCKIFY_KEY
    }
}
const clockifyWorkspace = process.env.CLOCKIFY_WORKSPACE

module.exports = {
    async findAll (...args) {
        try {
            let request = { 
                params: {
                    hydrated: true,
                    'page-size': 200
                }
            }
            let config = {...axiosConfig, ...request}
            const response = await axios.get(`/workspaces/${clockifyWorkspace}/projects`, config)
            return response.data
        } catch (error) {
            console.error(error)
        }
    },
    async findOne(...args) {

        const projectId = args[0].projectId

        try {
            let request = { 
                params: {
                    hydrated: true
                }
            }
            let config = {...axiosConfig, ...request}
            const response = await axios.get(`/workspaces/${clockifyWorkspace}/projects/${projectId}`, config)
            return response.data
        } catch (error) {
            console.error(error)
        }
    },
    async createClockifyProject(project) {

        const projectName = project.dealname,
              projectOwner = project.contacts[0].firstname + ' ' + project.contacts[0].lastname

        try {

            let clientRequest = { 
                params: {
                    name: projectOwner,
                    'page-size': 200
                }
            }
            let clientConfig = {...axiosConfig, ...clientRequest}
            const responseData = await axios.get(`/workspaces/${clockifyWorkspace}/clients`, clientConfig)
            let clientId = null

            // Client does not exist, create a new one
            if(!responseData.data || responseData.data === []) {
                const responseData = await axios.post(`/workspaces/${clockifyWorkspace}/clients`, {
                    name: projectOwner,
                    note: ""
                  })
                clientId = responseData.data[0].id
            }
            else {
                clientId = responseData.data[0].id
            }

            let project = { 
                name: projectName,
                clientId: clientId,
                isPublic: "true",
                billable: "true",
                public: true
            }
            
            const response = await axios.post('/workspaces/${clockifyWorkspace}/projects', project)
            return response.data
        } catch (error) {
            console.error(error)
        }
    }
}
