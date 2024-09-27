'use strict';

module.exports = (config, { strapi }) => {

    return async (ctx, next) => {
        const currentDate = new Date()
    
        // Year present in query
        if(!ctx.query.filters || !ctx.query.filters.year || !ctx.query.filters.year.$eq) {

            if(!ctx.query.filters || !ctx.query.filters.year) {
                ctx.query.filters = { ...{ year: { $eq: null } } }
            }

            // Is after december of the current financial year
            if(currentDate.getMonth() < 7) {
                ctx.query.filters.year.$eq = (currentDate.getFullYear()) - 1
            }
            // Is before december of the current financial year
            else {
                ctx.query.filters.year.$eq = currentDate.getFullYear()
            }
        }
    
        await next()
    }
}