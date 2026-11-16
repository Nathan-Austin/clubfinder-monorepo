/**
 * Primary HTTP client for the app.
 * Uses axios with NativeFetchService adapter for reliable networking.
 */

import axios, { AxiosInstance } from 'axios';
import nativeFetch from '../services/NativeFetchService';
import { type HttpError, errorMessage, errorStatus } from '../types/api';

const API_URL = 'https://www.clubfindr.com';

type FetchMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * axios `params` as a query string. The adapter passed only `config.data` to NativeFetchService,
 * so `axiosClient.get(url, { params })` sent no query string at all and the server saw none of
 * it; the one caller that did this was dead code pointing at an endpoint that does not exist.
 */
function withQuery(url: string, params?: unknown): string {
    if (!params || typeof params !== 'object') return url;
    const query = Object.entries(params as Record<string, unknown>)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
    if (!query) return url;
    return url.includes('?') ? `${url}&${query}` : `${url}?${query}`;
}

// Create axios instance using NativeFetchService
const instance: AxiosInstance = axios.create({
    baseURL: API_URL,
    adapter: async (config) => {
        try {
            const method = (config.method?.toLowerCase() || 'get') as FetchMethod;
            const endpoint = withQuery(config.url || '', config.params);

            // Use NativeFetchService for the actual request
            const response =
                method === 'get'
                    ? await nativeFetch.get<Record<string, unknown>>(endpoint)
                    : await nativeFetch[method]<Record<string, unknown>>(endpoint, config.data);

            // Return axios-compatible response
            if (response && typeof response === 'object' && 'error' in response && response.error) {
                const failure = response.error as { status?: number; message?: string };
                throw {
                    response: {
                        status: failure.status || 500,
                        statusText: failure.message || 'Internal Server Error',
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
        } catch (caught) {
            // Enhance error with request details, keeping the status the server answered
            const error = (caught instanceof Error ? caught : new Error(String(caught))) as HttpError & {
                config?: unknown;
                request?: unknown;
            };
            error.response = error.response ?? {
                status: errorStatus(caught) ?? 500,
                statusText: errorMessage(caught, 'Internal Server Error'),
                data: { message: errorMessage(caught, 'Internal Server Error') }
            };
            error.config = config;
            error.request = null;
            throw error;
        }
    }
});

export default instance;
