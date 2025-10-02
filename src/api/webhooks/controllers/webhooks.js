'use strict';

const camelcase = require('camelcase');
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

      if(payload.attemptNumber > 0) {
        ctx.status = 102
        return
      }

      // Create the project if the deal is created in HubSpot
      if(payload.subscriptionType === 'deal.creation') {
        try {
          const project = await strapi.service('api::project.project').createFromHubspot(payload.objectId)
          ctx.body = project
          ctx.status = 201
        }
        catch (err) {
          if(err.message === 'Missing required fields') {
            ctx.body = { message: `Missing required fields`, error: err };
            ctx.status = 422
            return
          }
          else {
            ctx.body = { message: `Error creating project`, error: err };
            ctx.status = 500
            return
          }
        }
      }

      // If property changed
      if(payload.subscriptionType === 'deal.propertyChange') {

        // Find the project with the hubspotID
        const project = await strapi.documents('api::project.project').findFirst({ filters: { hubspotID: payload.objectId } })

        // If the project exists
        if(project) {
          // Initialize the data payload
          const data = {}
                  
          // If the property is a date, convert it to ISO format
          if(payload.propertyName === 'start_date' || payload.propertyName === 'end_date') {
            data[camelcase(payload.propertyName)] = DateTime.fromMillis(Number(payload.propertyValue)).toISODate()
          }
          // Otherwise, just set the value
          else {
            data[camelcase(payload.propertyName)] = payload.propertyValue
          }

          // Update the project with the new data
          await strapi.documents('api::project.project').update({ 
              documentId: project.documentId,
              data: data
          })

          ctx.body = project
          ctx.status = 200
        }
        else {
          try {
            const project = await strapi.service('api::project.project').createFromHubspot(payload.objectId)
            ctx.body = project
            ctx.status = 201
            return
          }
          catch (err) {
            if(err.message === 'Missing required fields') {
              ctx.body = { message: `Missing required fields`, error: err };
              ctx.status = 422
              return
            }
            else {
              ctx.body = { message: `Error creating project`, error: err };
              ctx.status = 500
              return
            }
          }
        }
      } 

      // Delete the project if the deal is deleted in HubSpot
      if(payload.subscriptionType === 'deal.deletion') {
        const project = await strapi.documents('api::project.project').findFirst({ filters: { hubspotID: payload.objectId } })
        if(project) {
          await strapi.documents('api::project.project').delete({ documentId: project.documentId })
          ctx.status = 200
        } else {
          ctx.status = 304
        }
      }

    } catch (err) {
      console.error(err)
      ctx.status = 500; // Set the HTTP status code to 500 to indicate a server error
    }
  },
}
