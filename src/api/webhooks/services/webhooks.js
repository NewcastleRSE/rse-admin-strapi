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
  hubspot: async (payload) => {

    let result = { data: null, status: null }

    try {

      if(payload.attemptNumber > 0) {
        result.status = 102
      }

      // Create the project if the deal is created in HubSpot
      if(payload.subscriptionType === 'deal.creation') {
        try {
          const project = await strapi.service('api::project.project').createFromHubspot(payload.objectId)
          result.data = project
          result.status = 201
        }
        catch (err) {
          if(err.message === 'Missing required fields') {
            result.data = { message: `Missing required fields`, error: err };
            result.status = 422
          }
          else {
            result.data = { message: `Error creating project`, error: err };
            result.status = 500
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

          result.data = updatedProject
          result.status = 200
        }
        else {
          try {
            const project = await strapi.service('api::project.project').createFromHubspot(payload.objectId)
            result.data = project
            result.status = 201
          }
          catch (err) {
            if(err.message === 'Missing required fields') {
              result.data = { message: `Missing required fields`, error: err };
              result.status = 422
            }
            else {
              result.data = { message: `Error creating project`, error: err };
              result.status = 500
            }
          }
        }
      } 

      // Associate Change
      if(payload.subscriptionType === 'deal.associationChange') {
        if(payload.associationType === 'DEAL_TO_CONTACT') {
          console.log('update contact')
        }

        if(payload.associationType === 'DEAL_TO_LINE_ITEM') {
          console.log('update line item')
        }

        result.status = 200
      }

      // Delete the project if the deal is deleted in HubSpot
      if(payload.subscriptionType === 'deal.deletion') {
        const project = await strapi.documents('api::project.project').findFirst({ filters: { hubspotID: payload.objectId } })
        if(project) {
          await strapi.documents('api::project.project').delete({ documentId: project.documentId })
          result.status = 204
        } else {
          result.status = 304
        }
      }

      return result

    } catch (err) {
      console.error(err)
      result.status = 500
      return
    }
  },
}
