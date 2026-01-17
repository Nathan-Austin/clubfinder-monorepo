const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Enable require.context for expo-router
config.transformer.unstable_allowRequireContext = true;

// Force tslib resolution to use the same version everywhere
config.resolver.alias = {
  ...config.resolver.alias,
  'tslib': path.resolve(__dirname, 'node_modules/tslib')
};

// Ensure tslib is included in the bundle
config.resolver.platforms = ['native', 'ios', 'android', 'web'];

module.exports = config;