import fetchClient from './fetchClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Use explicit HTTPS protocol
const API_URL = 'https://www.clubfindr.com';
console.log('API Client initialized with URL:', API_URL);

// Create our custom API client
const apiClient = {
  ...fetchClient,

  // Add a test function to validate connectivity
  testConnection: async () => {
    try {
      console.log('Testing API connection...');
      return await fetchClient.testConnection();
    } catch (error) {
      console.error('Connection test failed completely:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

// Export our enhanced client
export default apiClient;
