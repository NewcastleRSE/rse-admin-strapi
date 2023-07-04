"use strict";

/**
 * projects service.
 */

const { createCoreService } = require("@strapi/strapi").factories;
const camelcaseKeys = require("camelcase-keys");
const camelcase = require("camelcase");
const omitDeep = require("deepdash/omitDeep");
const Hubspot = require("@hubspot/api-client");
const hubspotClient = new Hubspot.Client({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
});
const dealProperties = process.env.HUBSPOT_DEAL_PROPERTIES.split(","),
  contactProperties = process.env.HUBSPOT_CONTACT_PROPERTIES.split(","),
  noteProperties = process.env.HUBSPOT_NOTE_PROPERTIES.split(","),
  stages = {
    meetingScheduled: process.env.HUBSPOT_DEAL_MEETING_SCHEDULED,
    bidPreparation: process.env.HUBSPOT_DEAL_BID_PREPARATION,
    grantWriting: process.env.HUBSPOT_DEAL_GRANT_WRITING,
    submittedToFunder: process.env.HUBSPOT_DEAL_SUBMITTED_TO_FUNDER,
    awaitingAllocation: process.env.HUBSPOT_DEAL_FUNDED_AWAITING_ALLOCATION,
    notFunded: process.env.HUBSPOT_DEAL_NOT_FUNDED,
    allocated: process.env.HUBSPOT_DEAL_ALLOCATED,
    completed: process.env.HUBSPOT_DEAL_COMPLETED,
  };

// Invert stages to key by HubSpot stage names
const invert = (obj) =>
  Object.fromEntries(Object.entries(obj).map((a) => a.reverse()));
const hsStages = invert(stages);

function formatDealStage(stage) {
  if (stage && hsStages[stage]) {
    return hsStages[stage]
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, function (str) {
        return str.toUpperCase();
      });
  } else {
    console.error(`${stage} is not in ${hsStages}`);
    return stage;
  }
}

function sliceArrayIntoChunks(arr, chunkSize) {
  const res = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    res.push(chunk);
  }
  return res;
}

// Recursively fetch all HubSpot deals
async function getDeals(after, limit, stageFilter, projectList) {
  try {
    // Stages are null or empty
    if (!stageFilter || !stageFilter.length) {
      stageFilter = Object.keys(hsStages);
    }

    const publicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            { propertyName: "dealstage", operator: "IN", values: stageFilter },
          ],
        },
      ],
      properties: dealProperties,
      limit,
      after,
    };

    let hsProjects = await hubspotClient.crm.deals.searchApi.doSearch(
      publicObjectSearchRequest
    );
    projectList = projectList.concat(hsProjects.results);
    if (hsProjects.paging) {
      return getDeals(
        hsProjects.paging.next.after,
        limit,
        stageFilter,
        projectList
      );
    } else {
      return projectList;
    }
  } catch (e) {
    console.error(e);
  }
}

// Recursively fetch all project associations (contacts, notes, etc.)
async function getAssociations(
  association,
  after,
  limit,
  properties,
  ids,
  associationList
) {
  try {
    const publicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_object_id", operator: "IN", values: ids },
          ],
        },
      ],
      properties,
      limit,
      after,
    };

    let hsAssociations;

    if (association === "contacts") {
      hsAssociations = await hubspotClient.crm.contacts.searchApi.doSearch(
        publicObjectSearchRequest
      );
      associationList = associationList.concat(hsAssociations.results);
    } else if (association === "notes") {
      hsAssociations = await hubspotClient.crm.objects.notes.searchApi.doSearch(
        publicObjectSearchRequest
      );
      associationList = associationList.concat(hsAssociations.results);
    } else {
      console.error("Invalid association type");
    }

    if (hsAssociations.paging) {
      return getAssociations(
        association,
        hsAssociations.paging.next.after,
        limit,
        properties,
        ids,
        associationList
      );
    } else {
      return associationList;
    }
  } catch (e) {
    console.error(e);
  }
}

// Takes a HubSpot response and reformats the keys
function formatHubSpotObject(object) {
  // Format object ready for manipulation
  let objectProperties = object.properties;
  delete object.properties;

  object = { ...object, ...objectProperties };
  object.hubspotID = object.hs_object_id;
  object.contacts = [];
  object.notes = [];

  // Remove HubSpot properties - prefixed 'hs_'
  delete object.hs_lastmodifieddate;
  delete object.hs_object_id;

  // Remove duplicate creation date property
  delete object.createdate;

  // Deal object specifics
  if (object.dealstage) {
    // Set correct dealstage name from key
    object.dealstage = formatDealStage(object.dealstage);

    // Set properties for associated contacts and notes
    object.contacts = [];
    object.notes = [];
  }

  return camelcaseKeys(object);
}

function createStrapiProject(hubspotProject) {
  // Get or create the Clockify project
  strapi
    .service("api::timesheet.timesheet")
    .createClockifyProject(camelcaseKeys(hubspotProject))
    .then((clockifyProject) => {
      // Create the entry in Strapi to link Hubspot and Clockify
      strapi.entityService
        .create("api::project.project", {
          data: {
            name: hubspotProject.dealname,
            hubspotID: hubspotProject.id || hubspotProject.hubspotId,
            clockifyID: clockifyProject.id,
          },
        })
        .then((strapiProject) => {
          console.log(strapiProject);
          return strapiProject;
        })
        .catch((error) => {
          console.log("Error creating " + hubspotProject.dealname);
          console.error(error.details.errors);
        });
    })
    .catch((error) => {
      console.log("Error creating " + hubspotProject.dealname);
      console.error(error);
    });
}

module.exports = createCoreService("api::project.project", ({ strapi }) => ({
  async find(...args) {
    const { results, pagination } = await super.find(...args);

    let params = args[0];

    let hubspotDealStages = [];

    // Stage is present in query string, create array for filter
    if (params.stage) {
      params.stage.forEach((stage) => {
        hubspotDealStages.push(stages[camelcase(stage)]);
      });
    }

    // Recursively get all HubSpot deals that match the deal stage filter
    let response = await getDeals(0, 100, hubspotDealStages, []);

    let projects = [];

    // Create an array of formatted projects
    response.forEach((project) => {
      projects.push(formatHubSpotObject(project));
    });

    // Create a filter list of all project IDs
    let projectIDs = [];
    projects
      .map((project) => project.id)
      .forEach((projectId) => {
        projectIDs.push({ id: projectId });
      });

    // Use the filter list to fetch all contact and note associations
    let contactAssociationsResponse =
      await hubspotClient.crm.associations.batchApi.read("deal", "contact", {
        inputs: projectIDs,
      });
    let noteAssociationsResponse =
      await hubspotClient.crm.associations.batchApi.read(
        "deal",
        "engagements",
        { inputs: projectIDs }
      );

    // Use the contact associations to get an array of all contact objects
    const contactAssociations = contactAssociationsResponse.results
      .map((association) => association.to)
      .flat(1);
    const contactIDs = sliceArrayIntoChunks(
      [...new Set(contactAssociations.map((contact) => contact.id))],
      100
    );

    let getContacts = [];

    contactIDs.forEach((batch) => {
      getContacts.push(
        getAssociations("contacts", 0, 100, contactProperties, batch, [])
      );
    });

    const contacts = await Promise.all(getContacts).then((response) => {
      return response.flat(1);
    });

    // Use the note associations to get an array of all note objects
    const noteAssociations = noteAssociationsResponse.results
      .map((association) => association.to)
      .flat(1);
    const noteIDs = sliceArrayIntoChunks(
      [...new Set(noteAssociations.map((note) => note.id))],
      100
    );

    let getNotes = [];

    noteIDs.forEach(async (batch) => {
      getNotes.push(
        getAssociations("notes", 0, 100, noteProperties, batch, [])
      );
    });

    const notes = await Promise.all(getNotes).then((response) => {
      return response.flat(1);
    });

    let projectPromises = [];

    // Loop over all projects to build final response
    await projects.forEach(async (project) => {
      // Get contact IDs associated with this project
      let contactAssociation = contactAssociationsResponse.results.filter(
        (association) => {
          return association._from.id === project.id;
        }
      );

      let projectContacts = [];

      // If project has associated contacts
      if (contactAssociation.length) {
        let contactIDs = contactAssociation[0].to.map(
          (association) => association.id
        );

        // Filter the global contact list for just those associated with the project
        contacts
          .filter((contact) => {
            return contactIDs.includes(contact.id);
          })
          .forEach((contact) => {
            let contactProperties = contact.properties;
            contact = { ...contact, ...contactProperties };
            delete contact.properties;
            delete contact.hs_object_id;
            delete contact.createdate;
            delete contact.lastmodifieddate;

            projectContacts.push(contact);
          });
      }

      // Add array of contacts to project object
      project.contacts = projectContacts;

      // Get note IDs associated with this project
      let noteAssociation = noteAssociationsResponse.results.filter(
        (association) => {
          return association._from.id === project.id;
        }
      );

      let projectNotes = [];

      // If project has associated contacts
      if (noteAssociation.length) {
        let noteIDs = noteAssociation[0].to.map(
          (association) => association.id
        );

        // Filter the global notes list for just those associated with the project
        notes
          .filter((note) => {
            if (note?.id) return noteIDs.includes(note.id);
          })
          .forEach((note) => {
            let noteProperties = note?.properties;
            note = { ...note, ...noteProperties };
            delete note.properties;
            delete note.hs_object_id;
            delete note.createdate;
            delete note.lastmodifieddate;

            projectNotes.push(note);
          });
      }
      // Add array of notes to project object
      project.notes = projectNotes;

      // Fetch existing Strapi project
      projectPromises.push(
        super
          .find({ filters: { hubspotID: project.id } })
          .then(async (strapiProjects) => {
            let strapiProject;

            // Strapi project exists, attach Clockify ID
            if (strapiProjects.results.length === 1) {
              strapiProject = strapiProjects.results[0];
            }
            // Strapi project doesn't exist, create it
            else if (strapiProjects.results.length === 0) {
              if (
                ["Completed", "Allocated", "Awaiting Allocation"].includes(
                  project.dealstage
                )
              ) {
                console.log(`Creating Strapi project for ${project.dealname}.`);
                strapiProject = createStrapiProject(project);
              } else {
                console.info(
                  `Too early in lifecycle to create a Strapi project for ${project.dealname}`
                );
              }
            }
            // Only possible if duplicate HubSpotIDs in the database, schema makes this impossible
            else {
              console.error("More than two projects found - impossible!");
            }

            project.clockifyID = strapiProject
              ? strapiProject.clockifyID
              : null;
            project.id = strapiProject ? strapiProject.id : null;
          })
      );
    });

    return Promise.all(projectPromises).then(() => {
      pagination.page = 1;
      pagination.pageCount = 1;
      pagination.pageSize = projects.length;
      pagination.total = projects.length;

      return { results: projects, pagination };
    });
  },

  // This function takes a hubspotId as a parameter and then returns all of the project information associated with that id from hubspot.
  async findOne(projectID) {
    // Look for a clockifyID first, these have vastly different formats so if it cant find a clockifyID then we can continue and look for a hubspot project with the ID.
    let strapiProject = await super.find({
      filters: { clockifyID: projectID },
    });

    // The project will return as a normal strapi project which lacks the hubspot extra fields, so we can set the projectID to equal the hubspotID of that project which we do have in strapi and then continue as normal
    console.log(strapiProject);
    if (strapiProject.results.length > 0)
      projectID = strapiProject.results[0].hubspotID;
    // let response = await hubspotClient.crm.deals.searchApi.doSearch(publicObjectSearchRequest)
    return hubspotClient.crm.deals.basicApi
      .getById(projectID, dealProperties, null, ["contacts", "notes"])
      .then(async (project) => {
        project = formatHubSpotObject(project);

        // Add project contacts
        if (project.associations.contacts) {
          let contacts = await getAssociations(
            "contacts",
            0,
            100,
            contactProperties,
            [
              ...new Set(
                project.associations.contacts.results.map(
                  (contact) => contact.id
                )
              ),
            ],
            []
          );
          contacts.forEach((contact) => {
            project.contacts.push(formatHubSpotObject(contact));
          });
        }

        // Add project notes
        if (project.associations.notes) {
          let notes = await getAssociations(
            "notes",
            0,
            100,
            noteProperties,
            [
              ...new Set(
                project.associations.notes.results.map((note) => note.id)
              ),
            ],
            []
          );
          notes.forEach((note) => {
            project.notes.push(formatHubSpotObject(note));
          });
        }

        delete project.associations;

        // Fetch existing Strapi project
        let strapiProjects = await super.find({
            filters: { hubspotID: project.id },
          }),
          strapiProject = null;

        // Strapi project exists, attach Clockify ID
        if (strapiProjects.results.length === 1) {
          strapiProject = strapiProjects.results[0];
        }
        // Strapi project doesn't exist, create it
        else if (strapiProjects.results.length === 0) {
          if (
            ["Completed", "Allocated", "Awaiting Allocation"].includes(
              project.dealstage
            )
          ) {
            console.log(`Creating Strapi project for ${project.dealname}.`);
            strapiProject = createStrapiProject(project);
          } else {
            console.info(
              `Too early in lifecycle to create a Strapi project for ${project.dealname}`
            );
          }
        }
        // Only possible if duplicate HubSpotIDs in the database, schema makes this impossible
        else {
          console.error("More than two projects found - impossible!");
        }

        project.clockifyID = strapiProject ? strapiProject.clockifyID : null;
        project.id = strapiProject ? strapiProject.id : null;

        return project;
      })
      .catch((err) => {
        if (err.code !== 404) {
          console.error(err);
        }
        console.error(err);
        return null;
      });
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
        return { results };
      })
      .catch((err) => {
        console.log(err);
      });
  },
}));
