'use strict'

const { DateTime } = require("luxon");

/**
 * timesheet service.
 */
// https://reports.api.clockify.me/v1/workspaces/61f3ac40ac897025894b32ca/reports/summary
// https://reports.api.clockify.me/v1/workspaces/61f3ac40ac897025894b32ca/reports/detailed
/* {
    "dateRangeStart": "2022-07-01T00:00:00.000",
    "dateRangeEnd": "2022-07-31T23:59:59.000",
    "detailedFilter": {
      "page": 1,
      "pageSize": 100
    },
    "users": {
      "ids": ["61f7a6dfba97e77c50b8f5c4"],
      "contains": "CONTAINS",
      "status": "ALL"
    }
  }*/

const axios = require('axios')
const apiConfig = {
    baseURL: `https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`,
    headers: {
        'X-Api-Key': process.env.CLOCKIFY_KEY
    }
}
const reportConfig = {
    baseURL: `https://reports.api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports`,
    headers: {
        'X-Api-Key': process.env.CLOCKIFY_KEY
    }
}

module.exports = {
    async findAll (...args) {
        const payload = {
            dateRangeStart: DateTime.now().startOf('day').minus({days: 30}),
            dateRangeEnd: DateTime.now().endOf('day'),
            summaryFilter: {
                groups: ['USER']
            }
        }
        try {
            const response = await axios.post(`/summary`, payload, reportConfig)
            return response.data
        } catch (error) {
            console.error(error)
        }
    },
    async findOne(...args) {

        const payload = {
            dateRangeStart: DateTime.now().startOf('day').minus({days: 30}),
            dateRangeEnd: DateTime.now().endOf('day'),
            detailedFilter: {
                page: 1,
                pageSize: 100
            },
            users: {
                ids: [args[0].userID],
                contains: 'CONTAINS',
                status: 'ALL'
            }
        }

        try {
            const response = await axios.post(`/detailed`, payload, reportConfig)
            return response.data
        } catch (error) {
            console.error(error)
        }
    },
    async createClockifyProject(project) {
        return new Promise(async (resolve, reject) => {
            
            const projectName = project.dealname,
                  projectOwner = project.contacts[0].firstname + ' ' + project.contacts[0].lastname

            try {

                let clientRequest = { 
                    params: {
                        name: projectOwner,
                        'page-size': 200
                    }
                }
                let clientConfig = {...apiConfig, ...clientRequest}
                const responseData = await axios.get(`/clients`, clientConfig)
                let clientId = null

                // Client does not exist, create a new one
                if(!responseData.data || responseData.data === []) {
                    const responseData = await axios.post(`/clients`, {
                        name: projectOwner,
                        note: ""
                    }, axiosConfig)
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
                
                const response = await axios.post(`/projects`, project, axiosConfig)
                resolve(response.data)
            } catch (error) {
                reject(error)
            }
        });
    }
}
