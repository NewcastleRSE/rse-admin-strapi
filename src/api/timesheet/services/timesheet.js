"use strict";

const { DateTime } = require("luxon");

/**
 * timesheet service.
 */
// https://reports.api.clockify.me/v1/workspaces/61f3ac40ac897025894b32ca/reports/summary
// https://reports.api.clockify.me/v1/workspaces/61f3ac40ac897025894b32ca/reports/detailed
/* {
    "dateRangeStart": "2022-07-01T00:00:00.000",
    "dateRangeEnd": "2022-07-31T23:59:59.000",
    "detailedFilter": {
      "page": 1,
      "pageSize": 100
    },
    "users": {
      "ids": ["61f7a6dfba97e77c50b8f5c4"],
      "contains": "CONTAINS",
      "status": "ALL"
    }
  }*/

const axios = require("axios");
const apiConfig = {
  baseURL: `https://api.clockify.me/api/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}`,
  headers: {
    "X-Api-Key": process.env.CLOCKIFY_KEY,
  },
};

const reportConfig = {
  baseURL: `https://reports.api.clockify.me/v1/workspaces/${process.env.CLOCKIFY_WORKSPACE}/reports`,
  headers: {
    "X-Api-Key": process.env.CLOCKIFY_KEY,
  },
};

// Creates and returns a report for all users in the workspace.
module.exports = {
  async findAll(...args) {
    const payload = {
      dateRangeStart: DateTime.utc().startOf("day").minus({ days: 30 }).toISO(),
      dateRangeEnd: DateTime.utc().endOf("day").toISO(),
      // This will filter by User, then by their projects, then by each task in each project. Clockify will show time spent by each user, time spent on each project and time spent on each task in each project. A task in a project could be a meeting or a task.
      summaryFilter: {
        groups: ["USER", "PROJECT", "TASK"],
      },
    };
    try {
      const response = await axios.post(`/summary`, payload, reportConfig);
      return {
        totals: response.data.totals,
        team: response.data.groupOne,
      };
    } catch (error) {
      console.error(error);
    }
  },

  // Can look through by userID and check if a user is working on two projects as much as the other.

  // Creates and returns a report for a specified user in the workspace.
  async findOne(userID) {
    const payload = {
      // Generates a report from the last 30 days.
      dateRangeStart: DateTime.utc().startOf("day").minus({ days: 30 }).toISO(),
      dateRangeEnd: DateTime.utc().endOf("day").toISO(),
      detailedFilter: {
        page: 1,
        pageSize: 100,
      },
      users: {
        ids: [userID],
        contains: "CONTAINS",
        status: "ALL",
      },
    };

    console.log(payload);

    try {
      const response = await axios.post(`/detailed`, payload, reportConfig);
      return response.data;
    } catch (error) {
      console.error(error);
    }
  },

  async createClockifyProject(hsProject) {
    return new Promise(async (resolve, reject) => {
      try {
        const projectName = hsProject.dealname,
          projectOwner =
            hsProject.contacts[0].firstname +
            " " +
            hsProject.contacts[0].lastname;

        let clientRequest = {
          params: {
            name: projectOwner,
            "page-size": 200,
          },
        };
        let projectRequest = {
          params: {
            name: projectName,
            "page-size": 200,
          },
        };
        let clientConfig = { ...apiConfig, ...clientRequest };
        let projectConfig = { ...apiConfig, ...projectRequest };
        let response = await axios.get(`/clients`, clientConfig);
        let clientId = null;

        // Client does not exist, create a new one
        if (!response.data || !response.data.length) {
          response = await axios.post(
            `/clients`,
            {
              name: projectOwner,
              note: "",
            },
            apiConfig
          );
          clientId = response.data.id;
        } else {
          clientId = response.data[0].id;
        }

        response = await axios.get(`/projects`, projectConfig);

        // Clockify project doesn't exist, create it
        if (!response.data || !response.data.length) {
          let project = {
            name: projectName,
            clientId: clientId,
            isPublic: "true",
            billable: "true",
            public: true,
          };

          resolve(await axios.post(`/projects`, project, apiConfig));
        } else {
          resolve(response.data[0]);
        }
      } catch (error) {
        reject(error.response ? error.response.data : error);
      }
    });
  },
};
