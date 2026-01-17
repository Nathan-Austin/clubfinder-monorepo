import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Platform } from 'react-native';
export interface NetworkDiagnostics {
    isConnected: boolean;
    connectionType?: string;
    networkStrength?: 'strong' | 'medium' | 'weak' | 'unknown';
    lastPingTime?: number;
    connectionInfo?: any;
}
// Track network state
let isConnected = true;
let connectionType: string | null = null;
let connectionQuality: 'unknown' | 'poor' | 'good' | 'excellent' = 'unknown';

// Initialize network monitoring
export const initNetworkMonitoring = () => {
    // Subscribe to network state updates
    NetInfo.addEventListener((state) => {
        isConnected = state.isConnected ?? false;
        connectionType = state.type;

        // Determine connection quality based on type
        if (!isConnected) {
            connectionQuality = 'unknown';
        } else if (state.type === 'wifi' || state.type === 'ethernet') {
            connectionQuality = 'excellent';
        } else if (state.type === 'cellular') {
            // On cellular, check generation
            if (state.details?.cellularGeneration) {
                const generation = state.details.cellularGeneration;
                switch (generation) {
                    case '5g':
                        connectionQuality = 'excellent';
                        break;
                    case '4g':
                        connectionQuality = 'good';
                        break;
                    case '3g':
                        connectionQuality = 'good';
                        break;
                    default:
                        connectionQuality = 'poor';
                }
            } else {
                connectionQuality = 'good'; // Default to good for unknown cellular
            }
        } else {
            connectionQuality = 'good'; // Default to good instead of unknown
        }

        console.log(`Network state changed: ${isConnected ? 'Connected' : 'Disconnected'}, Type: ${connectionType}, Quality: ${connectionQuality}`);
    });
};

// Get current network state
export const getNetworkState = async (): Promise<NetInfoState> => {
    return await NetInfo.fetch();
};

// Check if connected to the internet
export const isNetworkConnected = async (): Promise<boolean> => {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
};

// Get timeout for current connection quality
export const getTimeoutForConnection = (): number => {
    // Base timeout
    let timeout = 30000; // 30 seconds base

    // Adjust based on connection quality
    switch (connectionQuality) {
        case 'excellent':
            timeout = 15000; // 15 seconds for excellent connections
            break;
        case 'good':
            timeout = 30000; // 30 seconds for good connections
            break;
        case 'poor':
            timeout = 45000; // 45 seconds for poor connections
            break;
        default:
            timeout = 30000; // 30 seconds for unknown quality
    }

    // Small adjustment for Android
    if (Platform.OS === 'android') {
        timeout += 5000; // Add 5 seconds for Android
    }

    return timeout;
};

// Helper to handle network failures
export const handleNetworkFailure = async (error: any): Promise<string> => {
    const state = await NetInfo.fetch();

    const errorMessage = error.message || '';

    if (!state.isConnected) {
        return 'No internet connection. Please check your network settings and try again.';
    }

    if (errorMessage.includes('timed out')) {
        return 'Request timed out. The server is taking too long to respond. Please try again later.';
    }

    if (errorMessage.includes('Network request failed')) {
        return 'Network request failed. Please check your connection and try again.';
    }

    // Handle TLS/SSL specific errors
    if (errorMessage.includes('SSL') || errorMessage.includes('TLS') || errorMessage.includes('certificate')) {
        return 'Secure connection failed. Please check your device date/time settings and try again.';
    }

    if (errorMessage.includes('ECONNREFUSED')) {
        return 'Connection was refused. The server might be down or unreachable.';
    }

    return errorMessage || 'An unknown network error occurred';
};

export default {
    initNetworkMonitoring,
    getNetworkState,
    isNetworkConnected,
    getTimeoutForConnection,
    handleNetworkFailure
};
