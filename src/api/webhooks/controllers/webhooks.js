'use strict';

const camelcase = require('camelcase')
const DateTime = require('luxon').DateTime

const stages = {
  awaitingAllocation: process.env.HUBSPOT_DEAL_FUNDED_AWAITING_ALLOCATION,
  allocated: process.env.HUBSPOT_DEAL_ALLOCATED,
  completed: process.env.HUBSPOT_DEAL_COMPLETED,
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
  hubspot: async (ctx) => {
    try {

      const payload = ctx.request.body
      console.log(payload)

      // If property changed
      if(payload[0].subscriptionType === 'deal.propertyChange') {

        // Find the project with the hubspotID
        const project = await strapi.documents('api::project.project').findFirst({ filters: { hubspotID: payload[0].objectId } })

        // If the project exists
        if(project) {
          // Initialize the data payload
          const data = {}
                  
          // If the property is a date, convert it to ISO format
          if(payload[0].propertyName === 'start_date' || payload[0].propertyName === 'end_date') {
            data[camelcase(payload[0].propertyName)] = DateTime.fromMillis(Number(payload[0].propertyValue)).toISODate()
          }
          // Otherwise, just set the value
          else {
            data[camelcase(payload[0].propertyName)] = payload[0].propertyValue
          }

          // Update the project with the new data
          await strapi.documents('api::project.project').update({ 
              documentId: project.documentId,
              data: data
          })

          // Return 200
          ctx.status = 200
        }
        // If the project does not exist and the stage is awaitingAllocation, allocated, or completed
        else if(payload[0].propertyName === 'dealstage') {
          const stage = formatDealStage(payload[0].propertyValue)

          if(stage === 'Awaiting Allocation' || stage === 'Allocated' || stage === 'Completed') {
            try {
              await strapi.service('api::project.project').createFromHubspot(payload[0].objectId)
              ctx.status = 200
            }
            catch (err) {
              console.error(err)
              ctx.status = 500
            }
            ctx.status = 200
          }
          else {
            ctx.status = 304; return
          }
        } 
        // If the project does not exist and the stage is not awaitingAllocation, allocated, or completed
        else {
          ctx.status = 304; return
        }
      } 
    } catch (err) {
      console.error(err)
      ctx.status = 500; // Set the HTTP status code to 500 to indicate a server error
    }
  },
}
