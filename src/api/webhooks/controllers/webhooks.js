'use strict';

const camelcase = require('camelcase')
const DateTime = require('luxon').DateTime

const stages = {
  meetingScheduled: process.env.HUBSPOT_DEAL_MEETING_SCHEDULED,
  bidPreparation: process.env.HUBSPOT_DEAL_BID_PREPARATION,
  grantWriting: process.env.HUBSPOT_DEAL_GRANT_WRITING,
  submittedToFunder: process.env.HUBSPOT_DEAL_SUBMITTED_TO_FUNDER,
  notFunded: process.env.HUBSPOT_DEAL_NOT_FUNDED,
  awaitingAllocation: process.env.HUBSPOT_DEAL_FUNDED_AWAITING_ALLOCATION,
  allocated: process.env.HUBSPOT_DEAL_ALLOCATED,
  completed: process.env.HUBSPOT_DEAL_COMPLETED
}

const propertyMap = {
  account_code: 'account',
  amount: 'amount',
  award_stage: 'awardStage',
  cost_model: 'costModel',
  dealname: 'name',
  dealstage: 'stage',
  end_date: 'endDate',
  faculty: 'faculty',
  finance_contact: 'financeContact',
  funding_body: 'funder',
  hs_object_id: 'hsObjectId',
  project_value: 'value',
  school: 'school',
  start_date: 'startDate',
  nu_projects_number: 'nuProjects',
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
            data[propertyMap[payload.propertyName]] = DateTime.fromMillis(Number(payload.propertyValue)).toISODate()
          }
          else if(payload.propertyName === 'dealstage') {
              data[propertyMap[payload.propertyName]] = formatDealStage(payload.propertyValue)
            }
          // Otherwise, just set the value
          else {
            data[propertyMap[payload.propertyName]] = payload.propertyValue
          }

          // Update the project with the new data
          const updatedProject = await strapi.documents('api::project.project').update({ 
              documentId: project.documentId,
              data: data
          })

          ctx.body = updatedProject
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
          ctx.status = 204
          return
        } else {
          ctx.status = 304
          return
        }
      }

    } catch (err) {
      console.error(err)
      ctx.status = 500; // Set the HTTP status code to 500 to indicate a server error
    }
  },
}
