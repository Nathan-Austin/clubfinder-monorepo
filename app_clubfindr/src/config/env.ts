import Constants from 'expo-constants';

// Use environment variables if available, otherwise use defaults
export const API_URL = 'https://www.clubfindr.com';

// Endpoints
export const ENDPOINTS = {
    // Auth
    LOGIN: '/login/users',
    MOBILE_LOGIN: '/api/mobile/login',

    // Venues
    VENUES: '/api/mobile/bars',
    VENUE_DETAILS: (id: string) => `/api/mobile/bars/${id}`,
    MATCHING_VENUES: '/api/venues/matching',
};

// Version information
export const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
export const BUILD_NUMBER = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1';

// Configuration for different environments
export const ENV_CONFIG = {
    development: {
        timeout: 30000, // 30 seconds
        retryCount: 3,
    },
    production: {
        timeout: 15000, // 15 seconds
        retryCount: 2,
    },
};

// Current environment configuration
export const currentConfig = __DEV__ ? ENV_CONFIG.development : ENV_CONFIG.production;