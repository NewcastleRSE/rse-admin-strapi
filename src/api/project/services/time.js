const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::time.time', ({ strapi }) =>  ({
    async find(...args) { 
        return true
    },
    async findOne(...args) {
        return true
    }

}))