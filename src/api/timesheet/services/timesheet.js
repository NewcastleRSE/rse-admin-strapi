'use strict';

/**
 * timesheet service.
 */

const axios = require('axios');
const axiosConfig = {
    baseURL: 'https://api.clockify.me/api/v1',
    headers: {
        'X-Api-Key': process.env.CLOCKIFY_KEY
    }
}

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
            const response = await axios.get('/workspaces/61f3ac40ac897025894b32ca/projects', config);
            return response.data
        } catch (error) {
            console.error(error);
        }
    },
    async findOne(...args) {
        return await 'One'
    }
};
