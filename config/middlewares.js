module.exports = [
  'strapi::errors',
  'strapi::security',
  // {
  //   name: "strapi::security",
  //   config: {
  //     contentSecurityPolicy: {
  //       useDefaults: true,
  //       directives: {
  //         "connect-src": ["'self'", "https:"],
  //         "img-src": [
  //           "'self'",
  //           "data:",
  //           "blob:",
  //           "res.cloudinary.com", // cloudinary images
  //           "lh3.googleusercontent.com", // google avatars
  //           "platform-lookaside.fbsbx.com", // facebook avatars
  //           "dl.airtable.com", // strapi marketplace
  //         ],
  //         "media-src": [
  //           "'self'",
  //           "data:",
  //           "blob:",
  //           "res.cloudinary.com", // cloudinary images
  //           "lh3.googleusercontent.com", // google avatars
  //           "platform-lookaside.fbsbx.com", // facebook avatars
  //           "dl.airtable.com", // strapi marketplace
  //         ],
  //         upgradeInsecureRequests: null,
  //       },
  //     },
  //   },
  // },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::logger',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
