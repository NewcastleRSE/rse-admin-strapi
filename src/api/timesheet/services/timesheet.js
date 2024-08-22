"use strict";

const { DateTime, Interval } = require("luxon");

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

const leaveConfig = {
  baseURL: 'https://sageapps.ncl.ac.uk/public/',
  headers: {
    Authorization: `Bearer ${process.env.LEAVE_API_TOKEN}`
  }
}

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
        let formattedTime = calculateTime(duration);
        totalDuration += duration;
        result.push({
          staffMember: staffName,
          timeSpent: {
            days: formattedTime.days,
            hours: formattedTime.hours,
            minutes: formattedTime.minutes,
            seconds: formattedTime.seconds,
          },
        });
      }
    });
  }

  // works out the users percentile time allocation contribution to the project this month.
  result.map((user) => {
    let percentile = 0;
    let duration = 0;
    duration += user.timeSpent.days * 26640;
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

// Format time. Each day is 7.4 hours.
const calculateTime = (time) => {
  let days = Math.floor(time / 26640);
  let hours = Math.floor((time % 26640) / 3600);
  let minutes = Math.floor((time % 3600) / 60);
  let seconds = Math.floor(time % 60);
  return { days: days, hours: hours, minutes: minutes, seconds: seconds };
};

// Gets the projects names and time allocation to each project
const getProjects = (data) => {
  // loop through all of the timeentries, find the unique project names.

  const response = []

  // Group time entries by project name
  const projects = data.timeentries.reduce(function (r, a) {
      r[a.projectName] = r[a.projectName] || [];
      r[a.projectName].push(a);
      return r;
  }, Object.create(null))

  // Loop through projects
  Object.keys(projects).forEach(name => {

    // Reduce all project time entry durations to single number
    const allocatedTime = projects[name].reduce((duration, timeentry) => duration + timeentry.timeInterval.duration, 0)

    // Calculate days, hours, minutes and seconds // change so its 7.4 hours per day.
    const formattedTime = calculateTime(allocatedTime);
    
    response.push({
      project: name,
      timeAllocation: {
        days: formattedTime.days,
        hours: formattedTime.hours,
        minutes: formattedTime.minutes,
        seconds: formattedTime.seconds,
      },
    });
  })

  return response;
};

const getUserName = (data) => {
  return data.timeentries[0]?.userName;
};

const getDateRanges = (period) => {
  period = period.toLowerCase();
  const now = DateTime.utc();
  let dateRangeStart, dateRangeEnd, days, months, year;
  // Can say last30days or last6months, cant say years becase we don't have permissiosn to see reports for date ranges longer than a year.
  if (period.indexOf("last") == 0) {
    days = period.slice(4, period.indexOf("days"));
    months = period.slice(4, period.indexOf("months"));
    if (days > 365) days = 365; // dont have permission to see reports for date ranges longer than a year.
    if (months > 12) months = 12;
    if (days < 0) days = 0;
    if (months < 0) months = 0;
    period = days && "days";
    period = months && "months";
  }

  // If it's a year such as 2023 then set the period to year for the switch statement and extract the year
  if (period.indexOf("20") == 0) {
    year = period.slice(0, 4);
    period = year && "year";
  }

  // Switch statement to work out time periods.
  switch (period) {
    case "monthly":
      dateRangeStart = DateTime.utc(now.year, now.month, 1).toISO();
      dateRangeEnd = DateTime.utc().endOf("day").toISO();
      break;
    case "yearly":
      if (now.month > 7) {
        dateRangeStart = DateTime.utc(now.year, 8, 1).toISO();
        dateRangeEnd = DateTime.utc(now.year + 1, 7, 31).toISO();
        // If it's earlier than July then the start should be 1st of August of last year and the end should be July 31st of this year.
      } else {
        dateRangeStart = DateTime.utc(now.year - 1, 8, 1).toISO();
        dateRangeEnd = DateTime.utc(now.year, 7, 31).toISO();
      }
      break;
    case "year":
      dateRangeStart = DateTime.utc(Number(year), 8, 1).toISO();
      dateRangeEnd = DateTime.utc(Number(year) + 1, 7, 31).toISO();
      break;
    case "weekly":
      // Current period is from Monday to Friday, but can increase 5 to 7 to get Monday - Sunday.
      (dateRangeStart = DateTime.utc().startOf("week").toISO()),
        (dateRangeEnd = DateTime.utc()
          .startOf("week")
          .plus({ days: 5 })
          .toISO());
      break;
    case "days":
      (dateRangeStart = DateTime.utc()
        .startOf("day")
        .minus({ days: days })
        .toISO()),
        (dateRangeEnd = DateTime.utc().endOf("day").toISO());
      break;
    case "months":
      (dateRangeStart = DateTime.utc()
        .startOf("day")
        .minus({ months: months })
        .toISO()),
        (dateRangeEnd = DateTime.utc().endOf("day").toISO());
      break;
    case "january":
      dateRangeStart = dateHelper(1).dateRangeStart;
      dateRangeEnd = dateHelper(1).dateRangeEnd;
      break;
    case "february":
      dateRangeStart = dateHelper(2).dateRangeStart;
      dateRangeEnd = dateHelper(2).dateRangeEnd;
      break;
    case "march":
      dateRangeStart = dateHelper(3).dateRangeStart;
      dateRangeEnd = dateHelper(3).dateRangeEnd;
      break;
    case "april":
      dateRangeStart = dateHelper(4).dateRangeStart;
      dateRangeEnd = dateHelper(4).dateRangeEnd;
      break;
    case "may":
      dateRangeStart = dateHelper(5).dateRangeStart;
      dateRangeEnd = dateHelper(5).dateRangeEnd;
      break;
    case "june":
      dateRangeStart = dateHelper(6).dateRangeStart;
      dateRangeEnd = dateHelper(6).dateRangeEnd;
      break;
    case "july":
      dateRangeStart = dateHelper(7).dateRangeStart;
      dateRangeEnd = dateHelper(7).dateRangeEnd;
      break;
    case "august":
      dateRangeStart = dateHelper(8).dateRangeStart;
      dateRangeEnd = dateHelper(8).dateRangeEnd;
      break;
    case "september":
      dateRangeStart = dateHelper(9).dateRangeStart;
      dateRangeEnd = dateHelper(9).dateRangeEnd;
      break;
    case "october":
      dateRangeStart = dateHelper(10).dateRangeStart;
      dateRangeEnd = dateHelper(10).dateRangeEnd;
      break;
    case "november":
      dateRangeStart = dateHelper(11).dateRangeStart;
      dateRangeEnd = dateHelper(11).dateRangeEnd;
      break;
    case "december":
      // dont need to use dateHelper as this is the same regardless of when december occurs.
      dateRangeStart = DateTime.utc(now.year - 1, 12, 1).toISO();
      dateRangeEnd = DateTime.utc(now.year, 1, 1).minus({ days: 1 }).toISO();
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

// This function takes a month, and returns the most recent month that has passed matching that month.
// e.g. if the month is 5 (May) and it's January, we want the May from the year before. However, if it's June, we want the May from that year.
const dateHelper = (month) => {
  const now = DateTime.utc();
  let dateRangeStart, dateRangeEnd;
  if (now.month > month) {
    dateRangeStart = DateTime.utc(now.year, month, 1).toISO();
    dateRangeEnd = DateTime.utc(now.year, month + 1, 1)
      .toISO();
  } else {
    dateRangeStart = DateTime.utc(now.year - 1, month, 1).toISO();
    dateRangeEnd = DateTime.utc(now.year - 1, month + 1, 1)
      .toISO();
  }
  // console.log(dateRangeStart);
  // console.log(dateRangeEnd);
  return { dateRangeStart: dateRangeStart, dateRangeEnd: dateRangeEnd };
};

// Creates and returns a report for all users in the workspace.
module.exports = {
  async find(...args) {

    const query = args[0]

    const currentDate = DateTime.utc()

    let startDate,
        endDate

    // Load timesheets of provided year
    if(query.filters.year.$eq) {
      startDate = DateTime.utc(Number(query.filters.year.$eq), 8)
    }
    // Is after december of the current financial year
    else if(currentDate.month < 8) {
      startDate = DateTime.utc(currentDate.year - 1, 8)
    }
    // Is before december of the current financial year
    else {
      startDate = DateTime.utc(currentDate.year, 8)
    }

    endDate = startDate.plus({ year: 1 })

    const payload = {
      dateRangeStart: startDate.toISO(),
      dateRangeEnd: endDate.toISO(),
      // This will filter by User, then by their projects, then by each task in each project. Clockify will show time spent by each user, time spent on each project and time spent on each task in each project. A task in a project could be a meeting or a task.
      tasks: { 
        contains: 'DOES_NOT_CONTAIN',
        ids: [ '61f7e1d7ba97e77c50bedfe1', '620f68f6ac46e3525d17c0fa', '6270d983736b43623af4c932', '61fd34562ea4bf0a6f564c4f' ]
      },
      summaryFilter: {
        groups: ['USER', 'MONTH', 'PROJECT',],
      },
    };

    try {
      const response = await axios.post(`/summary`, payload, reportConfig);

      const totals = {
        days: Math.round((response.data.totals[0].totalTime / 3600) / 7.4),
        entries: response.data.totals[0].entriesCount
      }

      const team = []

      response.data.groupOne.forEach(rse => {
        let rseGroup = {
          name: rse.name,
          days: Math.round((rse.duration / 3600) / 7.4),
          months: []
        }
        rse.children.forEach(month => {
          let monthGroup = {
            days: Math.round((month.duration / 3600) / 7.4),
            name: month.name,
            projects: []
          }
          month.children.forEach(project => {
            monthGroup.projects.push({
              days: Math.round((project.duration / 3600) / 7.4),
              name: project.name,
              client: project.clientName
            })
          })
          rseGroup.months.push(monthGroup)
        })
        team.push(rseGroup)
      })

      return {
        data: {
          totals: totals,
          team: team,
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

  async findOne(userID, ...args) {

    const query = args[0]

    const currentDate = DateTime.utc()

    let startDate,
        endDate

    // Load timesheets of provided year
    if(query.filters.year.$eq) {
      startDate = DateTime.utc(Number(query.filters.year.$eq), 8)
    }
    // Is after december of the current financial year
    else if(currentDate.month < 8) {
      startDate = DateTime.utc(currentDate.year - 1, 8)
    }
    // Is before december of the current financial year
    else {
      startDate = DateTime.utc(currentDate.year, 8)
    }

    endDate = startDate.plus({ year: 1 })

    const payload = {
      dateRangeStart: startDate.toISO(),
      dateRangeEnd: endDate.toISO(),
      detailedFilter: {
        page: 1,
        pageSize: 1000,
      },
      users: {
        ids: [userID],
        contains: "CONTAINS",
        status: "ALL",
      },
    }

    try {
      const response = await axios.post(`/detailed`, payload, reportConfig)

      const data = {
        totals: response.data.totals,
        dates: {}
      }

      response.data.timeentries.forEach(entry => {

        const key = DateTime.fromISO(entry.timeInterval.start).toISODate()

        if(!(key in data.dates)) {
          data.dates[key] = []
        }
        
        data.dates[key].push(entry)
      })

      return {
        data: data,
        meta: {
          pagination: {
            page: 1,
            pageSize: 1000,
            pageCount: 1,
            total: response.data.timeentries.length,
          },
        },
      }
    } catch (error) {
      console.error(error)
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

    console.log(period)
    const date = DateTime.fromFormat(`${period.month} ${period.year}`, 'LLLL yyyy')

    // This time range gets the entire fiscal annum
    const payload = {
      dateRangeStart: date.startOf('month').toISO({ includeOffset: false }) + 'Z',
      dateRangeEnd: date.endOf('month').toISO({ includeOffset: false }) + 'Z',
      // This will filter by User, then by their projects, then by each task in each project. Clockify will show time spent by each user, time spent on each project and time spent on each task in each project. A task in a project could be a meeting or a task.
      projects: {
        contains: "CONTAINS",
        ids: [id],
      },
      summaryFilter: {
        groups: ["USER"],
      },
    }

    let response = null

    try {
      response = await axios.post(`/summary`, payload, reportConfig);

      const rses = []

      response.data.groupOne.forEach(rse => {
        rses.push({
          name: rse.name,
          totalTime: rse.duration,
          amounts: rse.amount
        })
      })

      const totals = response.data.totals[0] ? response.data.totals[0] : { totalTime: 0, totalBillableTime: 0}

      return {
        data: {
          total: totals.totalTime,
          totalBillable: totals.totalBillableTime,
          rses: rses
        },
        meta: {
          period: {
            start: date.startOf('month').toISO({ includeOffset: false }) + 'Z',
            end: date.endOf('month').toISO({ includeOffset: false }) + 'Z',
            entriesCount: response.data.totals[0].entriesCount
          },
          pagination: {
            page: 1,
            pageSize: 100,
            pageCount: 1,
            total: response.data.groupOne.length,
          },
        },
      };
    } catch (error) {
      console.error(error)
    }
  },

  async findUser(id, period) {

    const user = await strapi.entityService.findOne('api::rse.rse', id)

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
        ids: [user.clockifyID],
        contains: "CONTAINS",
        status: "ALL",
      },
    };

    try {
      const response = await axios.post(`/detailed`, payload, reportConfig);
      return {
        data: {
          userName: getUserName(response.data, id),
          projects: getProjects(response.data, id),
        },
        meta: {
          period: {
            start: dateRangeStart.slice(0, dateRangeStart.indexOf("T")),
            end: dateRangeEnd.slice(0, dateRangeStart.indexOf("T")),
          },
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

  async findLeave(...args) {

    const query = args[0]

    let username

    if(query.filters.username.$eq) {
      username = query.filters.username.$eq
    }

    const currentDate = DateTime.utc()

    let startDate,
        endDate

    // Load leave of provided year
    if(query.filters.year.$eq) {
      startDate = DateTime.utc(Number(query.filters.year.$eq), 8)
    }
    // Is after december of the current financial year
    else if(currentDate.month < 8) {
      startDate = DateTime.utc(currentDate.year - 1, 8)
    }
    // Is before december of the current financial year
    else {
      startDate = DateTime.utc(currentDate.year, 8)
    }

    endDate = startDate.plus({ year: 1 })

    const period = Interval.fromDateTimes(startDate.startOf('day'), endDate.endOf('day'))

    try {

      // Due to the FY not being the same as the leave year, get the previous year too and combine the two
      const [response1, response2] = await Promise.all([
        axios.get(`/turner?YEAR=${startDate.year}-${endDate.year}`, leaveConfig),
        axios.get(`/turner?YEAR=${(startDate.year-1)}-${(endDate.year -1)}`, leaveConfig)
      ])

      const response = [...response1.data, ...response2.data]

      const FYleave = []

      // Include the leave that is within the FY period
      response.forEach(leave => {
        if (period.contains(DateTime.fromISO(leave.DATE))) {
          if(username && leave.ID !== username) return
          FYleave.push(leave)
        }
      })

      return {
        data: FYleave
      }
    }
    catch(ex) {
      console.error(ex)
    }
  },

  async findAllocatedTime(period) {
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
      return {
        data: {
          totalAllocatedDays: getTotalAllocatedDays(response.data.groupOne),
        },
        meta: {
          period: {
            start: dateRangeStart.slice(0, dateRangeStart.indexOf("T")),
            end: dateRangeEnd.slice(0, dateRangeStart.indexOf("T")),
          },
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
