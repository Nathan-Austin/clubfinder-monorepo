import axiosClient from '../api/axiosClient';
import { errorMessage, errorStatus, type ApiBarData } from '../types/api';
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
    password: string;
}): Promise<{ success: boolean; message?: string }> => {
    try {
        // Add platform info to the request
        const deviceInfo = {
            platform: Platform.OS,
            version: String(Platform.Version),
            isMobileApp: true
        };

        const response = await axiosClient.post('/api/mobile/bars/register', {
            ...formData,
            ...deviceInfo
        });

        return response.data;
    } catch (error) {
        console.error('Error registering bar:', error);

        // Try to extract error message from response
        const message = errorMessage(error, 'Registration failed. Please check your information and try again.');

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
    } catch (error) {
        console.error('Error confirming bar registration:', error);

        // Extract error message from response if available
        const errorMsg = errorMessage(error, 'Failed to confirm registration. Please try again later.');

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
    } catch (error) {
        console.error('Error resending confirmation code:', error);

        // Extract error message from response if available
        const errorMsg = errorMessage(error, 'Failed to resend confirmation code. Please try again later.');

        return { success: false, error: errorMsg };
    }
};

/**
 * Get bar profile information
 */
export const getBarProfile = async (): Promise<{
    success: boolean;
    barData?: ApiBarData;
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
    } catch (error) {
        console.error('Error fetching bar profile:', error);

        return {
            success: false,
            error: errorMessage(error, 'Failed to load bar profile')
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
    barData?: ApiBarData;
    error?: string;
}> => {
    try {
        const response = await axiosClient.post('/api/mobile/bars/login', {
            email,
            password,
            isMobileApp: true,
            platform: Platform.OS,
            // Text: Android's Platform.Version is a number (the API level), which the server
            // refused from 2026-11-14 until it learnt to take one, so every Android venue login
            // answered 400. A string works against both.
            version: String(Platform.Version)
        });

        if (response.data.success && response.data.token) {
            // Store the auth token
            await AsyncStorage.setItem('authToken', response.data.token);
            await AsyncStorage.setItem('userType', 'bar');

            if (response.data.barData) {
                // Store bar information
                await AsyncStorage.setItem('barData', JSON.stringify(response.data.barData));
            }

            return {
                success: true,
                token: response.data.token,
                barData: response.data.barData
            };
        }

        return {
            success: false,
            error: response.data.message || 'Login failed'
        };
    } catch (error) {
        console.error('Bar login error:', error);

        return {
            success: false,
            error: errorMessage(error, 'Login failed. Please try again.')
        };
    }
};

/**
 * Deletes one of the venue's events (`DELETE /api/mobile/bars/:barId/events/:eventId`, behind the
 * venue's session since 2026-11-09). The app answered every delete with "not available" until
 * 2026-11-17 (KNOWN_ISSUES 82). An event the server no longer has (404: deleted elsewhere, e.g. on
 * the web dashboard) counts as deleted, since that is what the venue asked for.
 */
export type DeleteBarEventResult =
    | { success: true }
    | { success: false; error: string; sessionEnded?: boolean };

export const deleteBarEvent = async (barId: string, eventId: string): Promise<DeleteBarEventResult> => {
    if (!barId || !eventId) {
        return { success: false, error: 'This event cannot be deleted. Pull down to refresh and try again.' };
    }
    try {
        await axiosClient.delete(
            `/api/mobile/bars/${encodeURIComponent(barId)}/events/${encodeURIComponent(eventId)}`
        );
        return { success: true };
    } catch (error) {
        const status = errorStatus(error);
        if (status === 404) {
            return { success: true };
        }
        if (status === 401 || status === 403) {
            return {
                success: false,
                sessionEnded: true,
                error: 'Your venue session has ended. Please log in again to delete events.'
            };
        }
        return { success: false, error: 'Could not delete the event. Please try again.' };
    }
};

/**
 * Deleting the venue account (DELETE /api/mobile/bars/:barId): the venue and everything it
 * owns go on the server, in one transaction (Google Play's account-deletion policy covers
 * venue accounts too). A venue the server no longer has (404) counts as deleted. The caller
 * logs out afterwards; the server has already ended every session.
 */
export type DeleteVenueAccountResult =
    | { success: true }
    | { success: false; error: string; sessionEnded?: boolean };

export const deleteVenueAccount = async (barId: string): Promise<DeleteVenueAccountResult> => {
    if (!barId) {
        return { success: false, error: 'Could not delete the venue account. Please log in again and retry.' };
    }
    try {
        await axiosClient.delete(`/api/mobile/bars/${encodeURIComponent(barId)}`);
        return { success: true };
    } catch (error) {
        const status = errorStatus(error);
        if (status === 404) {
            return { success: true };
        }
        if (status === 401 || status === 403) {
            return {
                success: false,
                sessionEnded: true,
                error: 'Your venue session has ended. Please log in again to delete the venue.'
            };
        }
        return { success: false, error: 'Could not delete the venue account. Please try again.' };
    }
};

export default {
    registerBar,
    confirmBarRegistration,
    resendConfirmationCode,
    getBarProfile,
    barLogin,
    deleteBarEvent,
    deleteVenueAccount
};
