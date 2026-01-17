import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import networkUtils from '../utils/networkUtils';
import NetworkCache from '../utils/NetworkCache';

export interface NetworkDiagnostics {
    isConnected: boolean;
    networkState?: any;
    adaptiveTimeout: number;
}

// Base URL for API requests
const API_URL = 'https://www.clubfindr.com';

// Initialize network monitoring
networkUtils.initNetworkMonitoring();

// Request timeout helper with adaptive timeout based on connection quality
const timeoutPromise = async (ms?: number) => {
    // If no timeout specified, use adaptive timeout based on connection quality
    const timeout = ms || networkUtils.getTimeoutForConnection();
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout);
    });
};

// Default request options
const getDefaultOptions = async (method: string, data?: any): Promise<RequestInit> => {
    // Get auth token if available
    const token = await AsyncStorage.getItem('authToken');

    const options: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': `ClubFindr-Mobile/${Platform.OS}-${Platform.Version}`,
            // Include any default headers
            ...(fetchClient.defaults?.headers || {})
        }
    };

    // Add auth token if available
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }

    // Add body for non-GET requests
    if (method !== 'GET' && data) {
        options.body = JSON.stringify(data);
    }

    return options;
};

// Log network operations
const logNetworkOperation = async (operation: string, details: any) => {
    console.log(`NETWORK ${operation.toUpperCase()} ============================`);
    console.log(JSON.stringify(details, null, 2));
    console.log(`Time: ${new Date().toISOString()}`);
};

// Log request details
const logRequest = async (url: string, method: string, options: RequestInit) => {
    await logNetworkOperation('request', {
        url,
        method,
        headers: options.headers
    });

    // Redact sensitive information
    let logData = options.body;
    if (typeof logData === 'string') {
        try {
            const parsedData = JSON.parse(logData);
            if (parsedData.password) {
                parsedData.password = '********';
            }
            logData = JSON.stringify(parsedData);
        } catch (e) {
            // If parsing fails, just use the original data
        }
    }

    console.log('Data:', logData || 'No data');
};

// Log response or error
const logResponse = async (url: string, status: number, data: any, timing: any) => {
    await logNetworkOperation('response', {
        url,
        status,
        timing,
        data: typeof data === 'object' ? JSON.stringify(data).substring(0, 200) + '...' : data
    });
};

const logError = async (url: string, error: any, timing?: any) => {
    await logNetworkOperation('error', {
        url,
        error: error.response ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
        } : {
            message: error.message
        },
        timing
    });
};

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

// Generic fetch function with timeout
const fetchWithTimeout = async <T>(
    endpoint: string,
    method: string,
    data?: any,
    options?: {
        timeout?: number;
        retries?: number;
        forceNoCache?: boolean;
    }
): Promise<T> => {
    // Ensure endpoint starts with a slash
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }

    const url = `${API_URL}${endpoint}`;
    const reqOptions = await getDefaultOptions(method, data);

    // Check if we should retry
    const maxRetries = options?.retries ?? 2;
    const timeout = options?.timeout || networkUtils.getTimeoutForConnection();

    // Force no cache headers if specified
    if (options?.forceNoCache) {
        reqOptions.headers = {
            ...reqOptions.headers,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        };
    }

    // Add a unique timestamp parameter to prevent caching
    if (options?.forceNoCache && method === 'GET') {
        const cacheBuster = `_t=${Date.now()}`;
        const hasQuery = url.includes('?');
        const newUrl = hasQuery ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
        endpoint = newUrl.slice(API_URL.length);
    }

    // Log request
    await logRequest(url, method, reqOptions);

    // Function to perform a single fetch attempt
    const attemptFetch = async (attempt: number): Promise<T> => {
        const performance = measureNetworkTiming();
        try {
            // First check if we're connected
            const isConnected = await networkUtils.isNetworkConnected();
            if (!isConnected) {
                throw new Error('No internet connection available');
            }

            // Create request with timeout
            const controller = new AbortController();
            reqOptions.signal = controller.signal;

            const timeoutId = setTimeout(() => {
                controller.abort();
                console.log(`Request to ${url} timed out after ${timeout}ms`);
            }, timeout);

            // Execute the request with performance monitoring
            performance.mark('fetchStart');
            console.log(`Fetch attempt ${attempt} to ${url} with timeout ${timeout}ms`);

            // DNS resolution and connection management
            performance.mark('dnsStart');
            const urlObj = new URL(url);
            await NetworkCache.resolveDNS(urlObj.hostname);
            performance.mark('dnsEnd');
            performance.measure('dns', 'dnsStart', 'dnsEnd');

            performance.mark('networkStart');

            const response = await Promise.race([
                fetch(url, reqOptions),
                timeoutPromise(timeout)
            ]) as Response;

            if (__DEV__) {
                console.log(`[TLS Debug] Response received from ${url}`);
                console.log(`[TLS Debug] Status: ${response.status}`);
                console.log(`[TLS Debug] Connection Info:`, {
                    headers: Object.fromEntries(response.headers.entries()),
                    rtt: response.headers.get('server-timing'),
                    compression: response.headers.get('content-encoding'),
                    connectionType: response.headers.get('connection'),
                    keepAlive: response.headers.get('keep-alive')
                });
            }
            performance.mark('networkEnd');
            performance.measure('network', 'networkStart', 'networkEnd');

            clearTimeout(timeoutId);
            performance.mark('fetchEnd');
            performance.measure('total', 'fetchStart', 'fetchEnd');

            const timing = performance.getTiming();
            console.log(`Request to ${url} completed with timing:`, timing);

            // Check response and connection status
            if (!response.ok) {
                // Enhanced error handling with connection diagnostics
                const errorData = await response.json().catch(() => ({}));
                const connectionInfo = {
                    keepAlive: response.headers.get('connection') === 'keep-alive',
                    protocol: response.headers.get('x-forwarded-proto') || 'unknown',
                    tlsVersion: response.headers.get('sec-tls-version'),
                    serverTime: response.headers.get('date'),
                };

                if (__DEV__) {
                    console.log(`[TLS Debug] Error response details:`, connectionInfo);
                }

                const error: any = new Error(`HTTP error ${response.status}: ${response.statusText || 'Unknown'}`);
                error.response = {
                    status: response.status,
                    statusText: response.statusText,
                    data: errorData,
                    connectionInfo
                };
                throw error;
            }


            // Parse response
            const contentType = response.headers.get('content-type');
            let result: any;

            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                result = await response.text();
            }


            // Log response with timing
            await logResponse(url, response.status, result, timing);

            return result as T;
        } catch (error: any) {
            await logError(url, error, performance.getTiming());

            // Check if we've exceeded retry attempts
            if (attempt >= maxRetries) {
                console.log(`All ${maxRetries} attempts failed for ${url}`);
                throw error;
            }

            // Add exponential backoff
            const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
            console.log(`Retrying after ${backoffTime}ms (attempt ${attempt + 1}/${maxRetries})`);

            // Wait for backoff time
            await new Promise(resolve => setTimeout(resolve, backoffTime));

            // Try again
            return attemptFetch(attempt + 1);
        }
    };

    // Start with first attempt
    return attemptFetch(0);
};

// Export API methods
const fetchClient = {
    // Default configurations that can be overridden
    defaults: {
        headers: {}
    },
    get: <T>(endpoint: string, data?: any, options?: {
        timeout?: number;
        retries?: number;
        forceNoCache?: boolean;
    }): Promise<T> => {
        // For GET requests, convert data to query params
        if (data) {
            const params = new URLSearchParams();
            Object.entries(data).forEach(([key, value]) => {
                params.append(key, String(value));
            });

            const queryString = params.toString();
            if (queryString) {
                endpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`;
            }
        }

        return fetchWithTimeout<T>(endpoint, 'GET', undefined, options);
    },

    post: <T>(endpoint: string, data?: any, options?: {
        timeout?: number;
        retries?: number;
        forceNoCache?: boolean;
    }): Promise<T> => {
        return fetchWithTimeout<T>(endpoint, 'POST', data, options);
    },

    put: <T>(endpoint: string, data?: any, options?: {
        timeout?: number;
        retries?: number;
        forceNoCache?: boolean;
    }): Promise<T> => {
        return fetchWithTimeout<T>(endpoint, 'PUT', data, options);
    },

    delete: <T>(endpoint: string, data?: any, options?: {
        timeout?: number;
        retries?: number;
        forceNoCache?: boolean;
    }): Promise<T> => {
        return fetchWithTimeout<T>(endpoint, 'DELETE', data, options);
    },
    getNetworkDiagnostics: async (): Promise<NetworkDiagnostics> => {
        try {
            const isConnected = await networkUtils.isNetworkConnected();
            const networkState = await networkUtils.getNetworkState();
            const adaptiveTimeout = networkUtils.getTimeoutForConnection();

            return {
                isConnected,
                networkState,
                adaptiveTimeout
            };
        } catch (error) {
            console.error('Failed to get network diagnostics:', error);
            return {
                isConnected: false,
                adaptiveTimeout: 15000 // Default timeout
            };
        }
    },
    // Test connection method
    testConnection: async (): Promise<{
        success: boolean;
        status?: number;
        statusText?: string;
        error?: string;
    }> => {
        try {
            console.log('Testing API connection...');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            // Use NetworkCache for DNS resolution
            const urlObj = new URL(API_URL);
            await NetworkCache.resolveDNS(urlObj.hostname);

            const response = await fetch(`${API_URL}/`, {
                method: 'HEAD',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            console.log('Connection test status:', response.status);

            return {
                success: response.ok,
                status: response.status,
                statusText: response.statusText
            };
        } catch (error) {
            console.error('Connection test failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
};

export default fetchClient;
