const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable require.context for expo-router
config.transformer.unstable_allowRequireContext = true;

config.resolver.platforms = ['native', 'ios', 'android', 'web'];

module.exports = config;