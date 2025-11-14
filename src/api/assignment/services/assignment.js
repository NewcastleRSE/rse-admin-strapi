'use strict';

/**
 * assignment service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::assignment.assignment', ({ strapi }) =>  ({
async find(...args) {
    
  // Calling the default core action
    const { results, pagination } = await super.find(...args);
    console.log(results)
     if (Array.isArray(results)) {
        results.forEach(assignment => {
          // Check if the 'rate' field is missing (null, undefined, or empty string)
          if (!assignment.rate) {
            assignment.rate = 'standard';
          }
        });
      }

     return { results, pagination };

}
})
);
