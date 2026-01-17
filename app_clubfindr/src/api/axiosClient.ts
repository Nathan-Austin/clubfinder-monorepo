/**
 * Primary HTTP client for the app.
 * Uses axios with NativeFetchService adapter for reliable networking.
 */

import axios, { AxiosInstance } from 'axios';
import nativeFetch from '../services/NativeFetchService';

const API_URL = 'https://www.clubfindr.com';

// Create axios instance using NativeFetchService
const instance: AxiosInstance = axios.create({
    baseURL: API_URL,
    adapter: async (config) => {
        try {
            const method = config.method?.toLowerCase() || 'get';
            const endpoint = config.url || '';
            const data = config.data;

            // Use NativeFetchService for the actual request
            const response = await (nativeFetch as any)[method](endpoint, data);

            // Return axios-compatible response
            if (response.error) {
                throw {
                    response: {
                        status: response.error.status || 500,
                        statusText: response.error.message || 'Internal Server Error',
                        data: response.error,
                        headers: {}
                    },
                    config,
                    request: null
                };
            }
            return {
                data: response,
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
                request: null
            };
        } catch (error: any) {
            // Enhance error with request details
            const errorResponse = error.response || {
                status: 500,
                statusText: error.message || 'Internal Server Error',
                data: error.data || { message: error.message }
            };

            error.config = config;
            error.response = errorResponse;
            error.request = null;
            throw error;
        }
    }
});

/**
 * Test login endpoint using axios
 * Used to verify TLS connection settings
 */
export const testLoginWithAxios = async (email: string, password: string) => {
    try {
        console.log('[TLS Test] Attempting login...');
        const startTime = Date.now();

        try {
            const response = await instance.post('/api/mobile/login', {
                email,
                password
            });

            const endTime = Date.now();
            console.log(`[TLS Test] Login completed in ${endTime - startTime}ms`);

            return {
                success: true,
                data: response.data,
                timing: endTime - startTime
            };
        } catch (error: any) {
            throw error;
        }
    } catch (error: any) {
        const errorDetails = error.response?.data || { message: error.message };
        console.error('[TLS Test] Login failed:', {
            status: error.response?.status,
            message: errorDetails.message || error.message,
            data: errorDetails
        });
        return {
            success: false,
            error: errorDetails.message || error.message,
            status: error.response?.status,
            data: errorDetails,
            timing: Date.now() - error.startTime || Date.now()
        };
    }
};

export default instance;
