module.exports = ({ env }) => ({
   'transformer': {
      enabled: true,
      config: {
        responseTransforms: {
          removeAttributesKey: true
        }
      }
    },
    'import-export-entries': {
      enabled: true,
    }
  });