'use strict';

const { DateTime } = require('luxon')
const { PDFDocument } = require('pdf-lib')
const fontKit = require('@pdf-lib/fontkit')
const fs = require('fs/promises')
const path = require('path')

/**
 * invoice service
 */

const { createCoreService } = require('@strapi/strapi').factories;
const { setupCache } = require('axios-cache-interceptor')
let axios = require('axios');
const { type } = require('os');

const instance = axios.create()
axios = setupCache(instance,
    {
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





module.exports = createCoreService('api::invoice.invoice', ({ strapi }) => ({
    async create(params) {

        // get facility rate projects where the cost model is facility and the stage is 'Awaiting allocation', "Allocated', or 'Completed'
        const facilityRateProjects = await strapi.db.query('api::project.project').findMany({
            where: {
                costModel: 'facility',
                stage: {
                    $in: ['Awaiting Allocation', 'Funded & Awaiting Allocated', 'Allocated', 'Completed']
                }
            }
            
        })

        // todo create start and end date dynamically

        // Calling Clockify
        const response = await axios.get('/projects?hydrated=true&page-size=5000', clockifyConfig)

        // Filtering the clockify projects that are in the project list
        const clockifyFacilityProjects = response.data.filter(p => facilityRateProjects.map(pr => pr.clockifyID).includes(p.id))
console.log(clockifyFacilityProjects.length)


        // console.log(response.data[0])
        response.data.forEach(async element => {

            const projectId = element.id

            const url = `https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports/detailed`;
            const data = {
                "dateRangeStart": "2025-07-01T00:00:00Z",
                "dateRangeEnd": "2025-08-01T00:00:00Z",
                "detailedFilter": {
                    "page": 1,
                    "pageSize": 1000
                },
                "exportType": "JSON",
                "rounding": false,
                "projects": {
                    "ids": [
                        projectId
                    ]
                }
            };

            const headers = {
                "x-api-key": process.env.CLOCKIFY_KEY,
                "Content-Type": "application/json"
            };

            axios.post(url, data, { headers: headers })
                .then(response => {
                   // console.log(response.data.totals); // Axios automatically parses JSON responses
                })
                .catch(error => {
                    //console.error(error);
                });



            //console.log(entries)
        });





        return true
    }
}))
