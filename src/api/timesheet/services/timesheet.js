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

const getTotalAllocatedDays = (data) => {
  return data;
};

// Maps through each user and their projects and searches for the project id (id), then adds up all of the duration (time spent) for each staff member and formats the duration into hours, minutes and seconds. Then pushes the staff members name and timespent into an array. This array only contains staff members that have spent more than 0 seconds on the project.
const formatProject = (data, id) => {
  let result = [];
  let totalDuration = 0;
  if (data) {
    data.map((user) => {
      let staffName = user.name;
      let duration = 0;
      user.children.map((project) => {
        if (project._id === id) {
          duration += project.duration;
        }
      });
      if (duration > 0) {
        // Convert time into hours, minutes and seeconds.
        // Calculate days, hours, minutes and seconds
        let days = Math.floor(duration / 86400);
        let hours = Math.floor((duration % 86400) / 3600);
        let minutes = Math.floor((duration % 3600) / 60);
        let seconds = Math.floor(duration % 60);

        totalDuration += duration;
        result.push({
          staffMember: staffName,
          timeSpent: {
            days: days,
            hours: hours,
            minutes: minutes,
            seconds: seconds,
          },
        });
      }
    });
  }

  // works out the users percentile time allocation contribution to the project this month.
  result.map((user) => {
    let percentile = 0;
    let duration = 0;
    duration += user.timeSpent.days * 86400;
    duration += user.timeSpent.hours * 3600;
    duration += user.timeSpent.minutes * 60;
    duration += user.timeSpent.seconds;
    percentile = (duration / totalDuration) * 100;
    user.percentageOfProject = percentile.toFixed(2);
  });

  return result;
};

// Maps through to find the project name. There is a way to do this through clockify too. https://docs.clockify.me/#tag/Project/operation/getProject
const getProjectName = (data, id) => {
  let projectName = "";
  if (data) {
    data.map((user) => {
      user.children.map((project) => {
        if (project._id === id) {
          projectName = project.name;
        }
      });
    });
  }
  return projectName;
};

// Gets the projects names and time allocation to each project
const getProjects = (data) => {
  // loop through all of the timeentries, find the unique project names.
  const projectNames = [];
  const projects = [];
  data.timeentries.map((project) => {
    if (!projectNames.includes(project.projectName)) {
      projectNames.push(project.projectName);
    }
  });
  // Loop through the projectNames then loop through the timeentries.
  projectNames.map((projectName) => {
    // Track amount of time spent on each project
    let allocatedTime = 0;
    data.timeentries.map((timeentry) => {
      // If the project is billable then increase time but the duration spent on the project
      if ((timeentry.projectName = projectName && timeentry.billable)) {
        allocatedTime += timeentry.timeInterval.duration;
      }
    });

    // Calculate days, hours, minutes and seconds
    let days = Math.floor(allocatedTime / 86400);
    let hours = Math.floor((allocatedTime % 86400) / 3600);
    let minutes = Math.floor((allocatedTime % 3600) / 60);
    let seconds = Math.floor(allocatedTime % 60);

    // Create an object and push it to projects that has a projectname and time allocation in days, hours, minutes and seconds.
    projects.push({
      project: projectName,
      timeAllocation: {
        days: days,
        hours: hours,
        minutes: minutes,
        seconds: seconds,
      },
    });
  });
  return projects;
};

const getUserName = (data) => {
  return data.timeentries[0]?.userName;
};

const getDateRanges = (period) => {
  const now = DateTime.utc();
  let dateRangeStart, dateRangeEnd;
  switch (period) {
    case "monthly":
      (dateRangeStart = DateTime.utc()
        .startOf("day")
        .minus({ days: 30 })
        .toISO()),
        (dateRangeEnd = DateTime.utc().endOf("day").toISO());
      break;
    case "yearly":
      if (now.month > 7) {
        dateRangeStart = DateTime.utc(now.year, 8, 1);
        dateRangeEnd = DateTime.utc(now.year + 1, 7, 31);
        // If it's earlier than July then the start should be 1st of August of last year and the end should be July 31st of this year.
      } else {
        dateRangeStart = DateTime.utc(now.year - 1, 8, 1);
        dateRangeEnd = DateTime.utc(now.year, 7, 31);
      }
      break;
    case "weekly":
      (dateRangeStart = DateTime.utc()
        .startOf("day")
        .minus({ days: 7 })
        .toISO()),
        (dateRangeEnd = DateTime.utc().endOf("day").toISO());
      break;
    default:
      (dateRangeStart = DateTime.utc()
        .startOf("day")
        .minus({ days: 30 })
        .toISO()),
        (dateRangeEnd = DateTime.utc().endOf("day").toISO());
      break;
  }
  return { dateRangeStart: dateRangeStart, dateRangeEnd: dateRangeEnd };
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
        data: {
          totals: response.data.totals,
          team: response.data.groupOne,
        },
        meta: {
          pagination: {
            page: 1,
            pageSize: 100,
            pageCount: 1,
            total: response.data.groupOne.length,
          },
        },
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

    try {
      const response = await axios.post(`/detailed`, payload, reportConfig);
      console.log(response);
      return {
        data: response.data,
        meta: {
          pagination: {
            page: 1,
            pageSize: 100,
            pageCount: 1,
            total: response.data.timeentries.length,
          },
        },
      };
    } catch (error) {
      console.error(error);
    }
  },

  // Request:
  // GET:http://localhost:8080/api/timesheets/project/{projectID}?populate=*
  // Output:
  // "projectAllocation": {
  //   "project": {
  //       "projectName": "RSE Team",
  //       "allocation": [
  //           {
  //               "user": "Tiago Sousa Garcia",
  //               "timeSpent": {
  //                   "hours": 14,
  //                   "minutes": 30,
  //                   "seconds": 1800
  //               }
  //           },
  // Will return a list of all users that have worked on a project as specified by the project id passed in. Will show their time spent in hours, minutes and seconds
  async findProject(id, period) {
    let dateRangeStart = getDateRanges(period).dateRangeStart;
    let dateRangeEnd = getDateRanges(period).dateRangeEnd;

    // This time range gets the entire fiscal annum
    const payload = {
      dateRangeStart: dateRangeStart,
      dateRangeEnd: dateRangeEnd,
      // This will filter by User, then by their projects, then by each task in each project. Clockify will show time spent by each user, time spent on each project and time spent on each task in each project. A task in a project could be a meeting or a task.
      summaryFilter: {
        groups: ["USER", "PROJECT"],
      },
    };
    try {
      const response = await axios.post(`/summary`, payload, reportConfig);
      console.log(response);
      return {
        data: {
          projectName: getProjectName(response.data.groupOne, id),
          allocation: formatProject(response.data.groupOne, id),
        },
        meta: {
          pagination: {
            page: 1,
            pageSize: 100,
            pageCount: 1,
            total: response.data.groupOne.length,
          },
        },
      };
    } catch (error) {
      console.error(error);
    }
  },

  async findUser(id, period) {
    let dateRangeStart = getDateRanges(period).dateRangeStart;
    let dateRangeEnd = getDateRanges(period).dateRangeEnd;

    const payload = {
      // Generates a report from the last 30 days.
      dateRangeStart: dateRangeStart,
      dateRangeEnd: dateRangeEnd,
      detailedFilter: {
        page: 1,
        pageSize: 100,
      },
      users: {
        ids: [id],
        contains: "CONTAINS",
        status: "ALL",
      },
    };

    try {
      const response = await axios.post(`/detailed`, payload, reportConfig);
      console.log(response.data);
      return {
        data: {
          userName: getUserName(response.data, id),
          projects: getProjects(response.data, id),
        },
        meta: {
          pagination: {
            page: 1,
            pageSize: 100,
            pageCount: 1,
            total: response.data.timeentries.length,
          },
        },
      };
    } catch (error) {
      console.error(error);
    }
  },

  async findAllocated() {
    const now = DateTime.utc();
    let dateRangeStart, dateRangeEnd;
    // If it's later than July then the start should be 1st of August of this year and the end should be July 31st of next year.
    if (now.month > 7) {
      dateRangeStart = DateTime.utc(now.year, 8, 1);
      dateRangeEnd = DateTime.utc(now.year + 1, 7, 31);
      // If it's earlier than July then the start should be 1st of August of last year and the end should be July 31st of this year.
    } else {
      dateRangeStart = DateTime.utc(now.year - 1, 8, 1);
      dateRangeEnd = DateTime.utc(now.year, 7, 31);
    }

    // This time range gets the entire fiscal annum
    const payload = {
      dateRangeStart: dateRangeStart.toISO(),
      dateRangeEnd: dateRangeEnd.toISO(),
      // This will filter by User, then by their projects, then by each task in each project. Clockify will show time spent by each user, time spent on each project and time spent on each task in each project. A task in a project could be a meeting or a task.
      summaryFilter: {
        groups: ["USER", "PROJECT"],
      },
    };
    try {
      const response = await axios.post(`/summary`, payload, reportConfig);
      console.log(response);
      // not currently giving a response for some reason.
      return {
        data: {
          totalALlocatedDays: getTotalAllocatedDays(response.data.groupOne),
        },
        meta: {
          pagination: {
            page: 1,
            pageSize: 100,
            pageCount: 1,
            total: response.data.groupOne.length,
          },
        },
      };
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
