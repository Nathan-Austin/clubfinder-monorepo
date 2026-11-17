import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';
import { log } from '../utils/logger';
import { errorMessage } from '../types/api';

type LoginCredentials = {
    email: string;
    password: string;
};

// Define the User type
type User = {
    id: string;
    email: string;
    name?: string;
    city?: string;
    isFirstTimeUser?: boolean;
    emailVerified?: boolean;
    onboardingComplete: boolean;  // Primary field from server
    onboarding_complete?: boolean; // Normalized field for app usage
};

// Helper function to normalize user data
/** The user as the login endpoints send it: the fields below, under either spelling */
type RawUser = Partial<User> & { onboarding_complete?: boolean };

const normalizeUserData = (userData: RawUser): User => {
    if (!userData) return userData;

    // Determine the onboarding status from either property
    const isOnboardingComplete = userData.onboardingComplete === true || userData.onboarding_complete === true;

    const normalized: User = {
        ...(userData as User),
        // Ensure both properties are set correctly
        onboardingComplete: isOnboardingComplete,
        onboarding_complete: isOnboardingComplete
    };

    console.log('AuthService: Normalizing user data');
    console.log('AuthService: Original onboardingComplete:', userData.onboardingComplete);
    console.log('AuthService: Original onboarding_complete:', userData.onboarding_complete);
    console.log('AuthService: Normalized onboardingComplete:', normalized.onboardingComplete);
    console.log('AuthService: Normalized onboarding_complete:', normalized.onboarding_complete);

    return normalized;
};

// Properly define the LoginResponse type
export type LoginResponse = {
    success: boolean;
    user: User;
    token: string;
    message?: string;
};

/**
 * Log in a user with email and password
 */
export const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    log.debug('AuthService: attempting login');

    try {
        // Make sure we include the isMobileApp flag in the request
        const loginData = {
            ...credentials,
            provider: 'local',
            isMobileApp: true
        };

        console.log('AuthService: Sending login request');

        // Use axiosClient
        const response = await axiosClient.post('/api/mobile/login', loginData);
        const data = response.data as LoginResponse;

        if (data.success && data.token) {
            // Normalize the user data to handle different field names
            const normalizedUser = normalizeUserData(data.user);
            console.log('AuthService: Normalized onboarding status:', normalizedUser.onboarding_complete);

            // Update the response with normalized user data
            const normalizedResponse = {
                ...data,
                user: normalizedUser
            };

            await storeAuthData(data.token, normalizedUser);
            return normalizedResponse;
        }
        if (!data.success) {
            throw new Error(data.message || 'Login failed');
        }

        throw new Error('Invalid response format');
    } catch (error) {
        console.error('AuthService: Login failed', errorMessage(error, 'login failed'));
        // No fallback to the web's /login/users (KNOWN_ISSUES 81): it sent the password a second
        // time on every failure, a wrong password included
        throw error;
    }
};

/**
 * Store authentication data in AsyncStorage
 */
const storeAuthData = async (token: string, user: User) => {
    try {

        // Save token for API requests
        await AsyncStorage.setItem('authToken', token);

        // Save user data
        if (user) {
            const userJson = JSON.stringify(user);
            await AsyncStorage.setItem('user', userJson);

        }

        // Save user's city if available
        if (user.city) {
            await AsyncStorage.setItem('userCity', user.city);
        }

        console.log('AuthService: Authentication data stored successfully');
    } catch (error) {
        console.error('Failed to store auth data', error);
    }
};

/**
 * Log out a user
 */
export const logout = async (): Promise<void> => {
    console.log('AuthService: Logging out');
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('userCity');
};

/**
 * Get the auth token
 */
export const getToken = async (): Promise<string | null> => {
    return AsyncStorage.getItem('authToken');
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = async (): Promise<boolean> => {
    const token = await getToken();
    return !!token;
};

/**
 * Get the authenticated user
 */
export const getUser = async (): Promise<User | null> => {
    const userString = await AsyncStorage.getItem('user');
    if (!userString) return null;

    try {
        return JSON.parse(userString);
    } catch (error) {
        console.error('Failed to parse user data', error);
        return null;
    }
};
