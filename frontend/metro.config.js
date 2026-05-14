const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// mssql / express / etc. are Node.js-only packages that use `import.meta`.
// They cannot be bundled by Metro for web/RN → stub them out.
const STUB = path.resolve(__dirname, 'shims/empty-module.js');
config.resolver.sourceExts.push('mjs');

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  mssql: STUB,
  express: STUB,
  'body-parser': STUB,
  cors: STUB,
  dotenv: STUB,
  tedious: STUB,
};

config.resolver.unstable_enablePackageExports = false;


config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

module.exports = config;
