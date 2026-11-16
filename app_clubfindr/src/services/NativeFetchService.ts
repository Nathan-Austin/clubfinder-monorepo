import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import NetworkCache from '../utils/NetworkCache';
import { httpError, errorMessage } from '../types/api';

const API_URL = 'https://www.clubfindr.com';

// Performance monitoring
interface NetworkTiming {
    [key: string]: number;
}

interface TimingMarks {
    [key: string]: number;
}

interface PerformanceMonitor {
    mark: (name: string) => void;
    measure: (name: string, startMark: string, endMark: string) => void;
    getTiming: () => NetworkTiming;
}

const measureNetworkTiming = (): PerformanceMonitor => {
    const timing: NetworkTiming = {};
    const marks: TimingMarks = {};

    return {
        mark: (name: string) => {
            marks[name] = Date.now();
        },
        measure: (name: string, startMark: string, endMark: string) => {
            if (marks[startMark] && marks[endMark]) {
                timing[name] = marks[endMark] - marks[startMark];
            }
        },
        getTiming: () => timing
    };
};

/**
 * The parsed JSON body, or for a body that is not JSON (an HTML error page, e.g. a 404 from a
 * server without the route), `{ message }` with its start. response.json() threw on those, and
 * the error carried no status, so the caller saw a 500 instead of the real one.
 */
async function readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch (parseError) {
        // A success that is not JSON is still an error, as before
        if (response.ok) throw parseError;
        return { message: `HTTP error ${response.status}`, responsePreview: text.substring(0, 200) };
    }
}

/**
 * Native fetch service for making HTTP requests
 * A direct replacement for any native fetch service you were using before
 */
const nativeFetch = {
    /**
     * Make a GET request
     */
    async get<T>(endpoint: string, queryParams?: Record<string, string | number | boolean>): Promise<T> {
        const performance = measureNetworkTiming();
        try {
            // Append query parameters to the URL if provided
            let url = `${API_URL}${endpoint}`;
            if (queryParams) {
                const queryString = Object.entries(queryParams)
                    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                    .join('&');

                url += url.includes('?') ? `&${queryString}` : `?${queryString}`;
            }

            const headers: HeadersInit = {
                'Accept': 'application/json',
                'User-Agent': `ClubFindr-Mobile/${Platform.OS}-${Platform.Version}`
            };

            // Add auth token if available
            const token = await AsyncStorage.getItem('authToken');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Log request (minimal)
            console.log(`[NativeFetch] GET ${endpoint}`);

            // DNS resolution and connection management
            performance.mark('dnsStart');
            const urlObj = new URL(url);
            await NetworkCache.resolveDNS(urlObj.hostname);
            performance.mark('dnsEnd');
            performance.measure('dns', 'dnsStart', 'dnsEnd');

            // Make request
            performance.mark('networkStart');
            const response = await fetch(url, {
                method: 'GET',
                headers
            });
            performance.mark('networkEnd');
            performance.measure('network', 'networkStart', 'networkEnd');

            const result = await readBody(response);
            if (!response.ok) {
                throw httpError(`HTTP error ${response.status}`, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    data: result
                });
            }

            return result as T;
        } catch (error) {
            console.error(`[NativeFetch] GET ${endpoint} failed:`, errorMessage(error, 'request failed'));
            throw error;
        }
    },

    /**
     * Make a POST request
     */
    async post<T>(endpoint: string, data?: unknown): Promise<T> {
        const performance = measureNetworkTiming();
        try {
            const url = `${API_URL}${endpoint}`;
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': `ClubFindr-Mobile/${Platform.OS}-${Platform.Version}`
            };

            // Add auth token if available
            const token = await AsyncStorage.getItem('authToken');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Prepare request body
            const body = typeof data === 'string' ? data : data ? JSON.stringify(data) : undefined;

            // Log request (minimal)
            console.log(`[NativeFetch] POST ${endpoint}`);

            // DNS resolution and connection management
            performance.mark('dnsStart');
            const urlObj = new URL(url);
            await NetworkCache.resolveDNS(urlObj.hostname);
            performance.mark('dnsEnd');
            performance.measure('dns', 'dnsStart', 'dnsEnd');

            // Make request
            performance.mark('networkStart');
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body
            });
            performance.mark('networkEnd');
            performance.measure('network', 'networkStart', 'networkEnd');

            // Get response content type
            const contentType = response.headers.get('content-type');

            // Get response text first
            const responseText = await response.text();

            // Try to parse as JSON if it looks like JSON or content type indicates JSON
            let result;
            try {
                if (contentType?.includes('application/json') ||
                    (responseText.trim().startsWith('{') || responseText.trim().startsWith('['))) {
                    result = JSON.parse(responseText);
                } else {
                    console.error('[NativeFetch] Non-JSON response received');
                    throw new Error('Response is not JSON');
                }
            } catch (parseError) {
                throw httpError('Invalid JSON response', {
                    status: response.status,
                    statusText: 'Invalid JSON response',
                    headers: Object.fromEntries(response.headers.entries()),
                    data: { message: 'Invalid JSON response' }
                });
            }

            if (!response.ok) {
                throw httpError(`HTTP error ${response.status}`, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    data: result
                });
            }

            return result as T;
        } catch (error) {
            console.error(`[NativeFetch] POST ${endpoint} failed:`, errorMessage(error, 'request failed'));
            throw error;
        }
    },

    /**
     * Make a PUT request
     */
    async put<T>(endpoint: string, data?: unknown): Promise<T> {
        const performance = measureNetworkTiming();
        try {
            const url = `${API_URL}${endpoint}`;
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': `ClubFindr-Mobile/${Platform.OS}-${Platform.Version}`
            };

            // Add auth token if available
            const token = await AsyncStorage.getItem('authToken');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Prepare request body
            const body = typeof data === 'string' ? data : data ? JSON.stringify(data) : undefined;

            // Log request (minimal)
            console.log(`[NativeFetch] PUT ${endpoint}`);

            // DNS resolution and connection management
            performance.mark('dnsStart');
            const urlObj = new URL(url);
            await NetworkCache.resolveDNS(urlObj.hostname);
            performance.mark('dnsEnd');
            performance.measure('dns', 'dnsStart', 'dnsEnd');

            // Make request
            performance.mark('networkStart');
            const response = await fetch(url, {
                method: 'PUT',
                headers,
                body
            });
            performance.mark('networkEnd');
            performance.measure('network', 'networkStart', 'networkEnd');

            const result = await readBody(response);
            if (!response.ok) {
                throw httpError(`HTTP error ${response.status}`, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    data: result
                });
            }

            return result as T;
        } catch (error) {
            console.error(`[NativeFetch] PUT ${endpoint} failed:`, errorMessage(error, 'request failed'));
            throw error;
        }
    },

    /**
     * Make a PATCH request
     */
    async patch<T>(endpoint: string, data?: unknown): Promise<T> {
        const performance = measureNetworkTiming();
        try {
            const url = `${API_URL}${endpoint}`;
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': `ClubFindr-Mobile/${Platform.OS}-${Platform.Version}`
            };

            // Add auth token if available
            const token = await AsyncStorage.getItem('authToken');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Prepare request body
            const body = typeof data === 'string' ? data : data ? JSON.stringify(data) : undefined;

            // Log request (minimal)
            console.log(`[NativeFetch] PATCH ${endpoint}`);

            // DNS resolution and connection management
            performance.mark('dnsStart');
            const urlObj = new URL(url);
            await NetworkCache.resolveDNS(urlObj.hostname);
            performance.mark('dnsEnd');
            performance.measure('dns', 'dnsStart', 'dnsEnd');

            // Make request
            performance.mark('networkStart');
            const response = await fetch(url, {
                method: 'PATCH',
                headers,
                body
            });
            performance.mark('networkEnd');
            performance.measure('network', 'networkStart', 'networkEnd');

            const result = await readBody(response);
            if (!response.ok) {
                throw httpError(`HTTP error ${response.status}`, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    data: result
                });
            }

            return result as T;
        } catch (error) {
            console.error(`[NativeFetch] PATCH ${endpoint} failed:`, errorMessage(error, 'request failed'));
            throw error;
        }
    },

    /**
     * Make a DELETE request
     */
    async delete<T>(endpoint: string, data?: unknown): Promise<T> {
        const performance = measureNetworkTiming();
        try {
            const url = `${API_URL}${endpoint}`;
            const headers: HeadersInit = {
                'Accept': 'application/json',
                'User-Agent': `ClubFindr-Mobile/${Platform.OS}-${Platform.Version}`
            };

            if (data) {
                headers['Content-Type'] = 'application/json';
            }

            // Add auth token if available
            const token = await AsyncStorage.getItem('authToken');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Prepare request body
            const body = typeof data === 'string' ? data : data ? JSON.stringify(data) : undefined;

            // Log request (minimal)
            console.log(`[NativeFetch] DELETE ${endpoint}`);

            // DNS resolution and connection management
            performance.mark('dnsStart');
            const urlObj = new URL(url);
            await NetworkCache.resolveDNS(urlObj.hostname);
            performance.mark('dnsEnd');
            performance.measure('dns', 'dnsStart', 'dnsEnd');

            // Make request
            performance.mark('networkStart');
            const response = await fetch(url, {
                method: 'DELETE',
                headers,
                body
            });
            performance.mark('networkEnd');
            performance.measure('network', 'networkStart', 'networkEnd');

            const result = await readBody(response);
            if (!response.ok) {
                throw httpError(`HTTP error ${response.status}`, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    data: result
                });
            }

            return result as T;
        } catch (error) {
            console.error(`[NativeFetch] DELETE ${endpoint} failed:`, errorMessage(error, 'request failed'));
            throw error;
        }
    }
};

export default nativeFetch;
