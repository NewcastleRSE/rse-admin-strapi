'use strict';

/**
 * projects service.
 */

const { createCoreService } = require('@strapi/strapi').factories;
const camelcaseKeys = require('camelcase-keys');
const Hubspot = require('@hubspot/api-client');
const hubspotClient = new Hubspot.Client({ apiKey: process.env.HUBSPOT_KEY });
const properties = process.env.HUBSPOT_DEAL_PROPERTIES.split(','),
      stages = {
        meetingScheduled: process.env.HUBSPOT_DEAL_MEETING_SCHEDULED,
        bidPreparation: process.env.HUBSPOT_DEAL_BID_PREPARATION,
        grantWriting: process.env.HUBSPOT_DEAL_GRANT_WRITING,
        submittedToFunder: process.env.HUBSPOT_DEAL_SUBMITTED_TO_FUNDER,
        awaitingAllocation: process.env.HUBSPOT_DEAL_FUNDED_AWAITING_ALLOCATION,
        notFunded: process.env.HUBSPOT_DEAL_NOT_FUNDED,
        allocated: process.env.HUBSPOT_DEAL_ALLOCATED,
        completed: process.env.HUBSPOT_DEAL_COMPLETED
      };

module.exports = createCoreService('api::project.project', ({ strapi }) =>  ({

  async find(...args) {  

    let params = args[0]

    const { results, pagination } = await super.find(...args);

    // Only 3 filters allowed at once
    const allocatedFilter = {
      filters: [
        { propertyName: "dealstage", operator: "EQ", value: stages.allocated },
      ],
    };
    const completedFilter = {
      filters: [
        { propertyName: "dealstage", operator: "EQ", value: stages.completed },
      ],
    };
    const awaitingAllocationFilter = {
      filters: [
        { propertyName: "dealstage", operator: "EQ",  value: stages.awaitingAllocation },
      ],
    };
    const submittedToFunderFilter = {
      filters: [
        { propertyName: "dealstage", operator: "EQ", value: stages.submittedToFunder },
      ],
    };

    let filterGroups = [];
    const sort = JSON.stringify({
      propertyName: "dealname",
      direction: "ASCENDING",
    });
    const limit = 100;
    const after = 0;

    if (params && params.stage) {
      let stages = Array.isArray(params.stage)
        ? params.stage
        : [params.stage];

      // need to add defence for max of 3 stages
      stages.forEach((stage) => {
        switch (stage) {
          case "allocated":
            filterGroups.push(allocatedFilter);
            break;
          case "completed":
            filterGroups.push(completedFilter);
            break;
          case "awaitingAllocation":
            filterGroups.push(awaitingAllocationFilter);
            break;
          case "submittedToFunder":
            filterGroups.push(submittedToFunderFilter);
            break;
          default:
            break;
        }
      });
    } else {
      filterGroups = [
        allocatedFilter,
        completedFilter,
        awaitingAllocationFilter,
      ];
    }

    const publicObjectSearchRequest = {
      filterGroups: filterGroups,
      sorts: [sort],
      properties,
      limit,
      after,
    };

    const hsProjects = await hubspotClient.crm.deals.searchApi.doSearch(publicObjectSearchRequest)

    hsProjects.results.forEach((project) => {
        results.push(project)
    })

    pagination.pageSize = 100
    pagination.pageCount = 1
    pagination.total = results.length

    return { results, pagination };
  },

  async findOne(...args) {

    const filter = [
      {
        filters: [
          {
            propertyName: "hs_object_id",
            operator: "EQ",
            value: args[0],
          },
        ],
      },
    ];

    const limit = 1;
    const after = 0;

    const publicObjectSearchRequest = {
      filterGroups: filter,
      properties,
      limit,
      after,
    };

    let response = await hubspotClient.crm.deals.searchApi.doSearch(publicObjectSearchRequest)

    let data = {}

    if(response.results.length === 1) {
        data = response.results[0]
    }
    else {
        console.error("ID should be unique")
    }

    return data
  },

  async update(...args) {
    // add error handling
    const id = args.id;
    const status = args.status;

    // add check if status is equal to Red, Amber or Green
    const prj = {
      id: id,
      properties: {
        status: status,
      },
    };

    await hubspotClient.crm.deals.batchApi
      .update({ inputs: [prj] })
      .then((results) => {
        return {results};
      })
      .catch((err) => {
        console.log(err);
      });
  }
}));