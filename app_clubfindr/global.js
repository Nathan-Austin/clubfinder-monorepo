// React Native global polyfills

global.setImmediate = global.setTimeout;
global.clearImmediate = global.clearTimeout;

// Polyfill for crypto and Buffer if needed
if (typeof global.Buffer === 'undefined') {
  global.Buffer = require('buffer').Buffer;
}

// Add process polyfill for React Native
if (typeof global.process === 'undefined') {
  global.process = require('process');
}


// Add btoa/atob polyfills for React Native
if (typeof global.btoa === 'undefined') {
  global.btoa = function(str) {
    return global.Buffer.from(str, 'binary').toString('base64');
  };
}

if (typeof global.atob === 'undefined') {
  global.atob = function(str) {
    return global.Buffer.from(str, 'base64').toString('binary');
  };
}
