import axiosClient from '../api/axiosClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Register a new bar
 */
export const registerBar = async (formData: {
    businessName: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    postcode: string;
    cityName: string;
    website: string;
    musicService: string;
    musicServiceEmail: string;
    password: string;
}): Promise<{ success: boolean; message?: string }> => {
    try {
        // Add platform info to the request
        const deviceInfo = {
            platform: Platform.OS,
            version: Platform.Version,
            isMobileApp: true
        };

        const response = await axiosClient.post('/api/mobile/bars/register', {
            ...formData,
            ...deviceInfo
        });

        return response.data;
    } catch (error: any) {
        console.error('Error registering bar:', error);

        // Try to extract error message from response
        const message = error.response?.data?.message ||
            'Registration failed. Please check your information and try again.';

        return { success: false, message };
    }
};

/**
 * Confirm bar registration with confirmation code
 */
export const confirmBarRegistration = async (
    email: string,
    confirmationCode: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const response = await axiosClient.post('/api/mobile/bars/confirm', {
            email,
            confirmationCode
        });

        return response.data;
    } catch (error: any) {
        console.error('Error confirming bar registration:', error);

        // Extract error message from response if available
        const errorMsg = error.response?.data?.error ||
            'Failed to confirm registration. Please try again later.';

        return { success: false, error: errorMsg };
    }
};

/**
 * Resend confirmation code
 */
export const resendConfirmationCode = async (
    email: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const response = await axiosClient.post('/api/mobile/bars/resend-code', {
            email
        });

        return response.data;
    } catch (error: any) {
        console.error('Error resending confirmation code:', error);

        // Extract error message from response if available
        const errorMsg = error.response?.data?.error ||
            'Failed to resend confirmation code. Please try again later.';

        return { success: false, error: errorMsg };
    }
};

/**
 * Get bar profile information
 */
export const getBarProfile = async (): Promise<{
    success: boolean;
    barData?: any;
    error?: string;
}> => {
    try {
        const token = await AsyncStorage.getItem('authToken');
        if (!token) {
            return {
                success: false,
                error: 'Authentication required'
            };
        }

        const response = await axiosClient.get('/api/mobile/bars/profile');
        return {
            success: true,
            barData: response.data
        };
    } catch (error: any) {
        console.error('Error fetching bar profile:', error);

        return {
            success: false,
            error: error.response?.data?.message || 'Failed to load bar profile'
        };
    }
};

/**
 * Login as a bar manager
 */
export const barLogin = async (
    email: string,
    password: string
): Promise<{
    success: boolean;
    token?: string;
    barData?: any;
    error?: string;
    spotify?: {  // Add this property to the return type
        ready: boolean;
        app_name?: string;
        client_id?: string;
        client_secret?: string;
    };
}> => {
    try {
        const response = await axiosClient.post('/api/mobile/bars/login', {
            email,
            password,
            isMobileApp: true,
            platform: Platform.OS,
            version: Platform.Version
        });

        if (response.data.success && response.data.token) {
            // Store the auth token
            await AsyncStorage.setItem('authToken', response.data.token);
            await AsyncStorage.setItem('userType', 'bar');

            if (response.data.barData) {
                // Store bar information
                await AsyncStorage.setItem('barData', JSON.stringify(response.data.barData));
            }

            // Return response including spotify property if it exists
            return {
                success: true,
                token: response.data.token,
                barData: response.data.barData,
                // Include the spotify property from the response
                ...(response.data.spotify && { spotify: response.data.spotify })
            };
        }

        return {
            success: false,
            error: response.data.message || 'Login failed'
        };
    } catch (error: any) {
        console.error('Bar login error:', error);

        return {
            success: false,
            error: error.response?.data?.message || 'Login failed. Please try again.'
        };
    }
};

/**
 * Update bar information
 */
export const updateBarInfo = async (
    updateData: Partial<{
        name: string;
        contactPerson: string;
        phone: string;
        address: string;
        postcode: string;
        city: string;
        website: string;
    }>
): Promise<{ success: boolean; message?: string }> => {
    try {
        const response = await axiosClient.put('/api/mobile/bars/update', updateData);

        return response.data;
    } catch (error: any) {
        console.error('Error updating bar information:', error);

        return {
            success: false,
            message: error.response?.data?.message || 'Failed to update bar information'
        };
    }
};

export default {
    registerBar,
    confirmBarRegistration,
    resendConfirmationCode,
    getBarProfile,
    barLogin,
    updateBarInfo
};