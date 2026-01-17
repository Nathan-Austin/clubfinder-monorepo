import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';

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
    spotify_id?: string;
    clientId?: string;
    clientSecret?: string;
    spotify_app_name?: string;
    isFirstTimeUser?: boolean;
    emailVerified?: boolean;
    onboardingComplete: boolean;  // Primary field from server
    onboarding_complete?: boolean; // Normalized field for app usage
};

// Helper function to normalize user data
const normalizeUserData = (userData: any): User => {
    if (!userData) return userData;

    // Determine the onboarding status from either property
    const isOnboardingComplete = userData.onboardingComplete === true || userData.onboarding_complete === true;

    const normalized = {
        ...userData,
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
    console.log('AuthService: Attempting login with:', credentials.email);

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
            console.log('AuthService: Login successful, raw user data:', data.user);
            // Normalize the user data to handle different field names
            const normalizedUser = normalizeUserData(data.user);
            console.log('AuthService: Normalized user data:', normalizedUser);
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
    } catch (error: any) {
        console.error('AuthService: Login failed', error);

        // Try fallback login endpoint if the mobile one fails
        try {
            console.log('AuthService: Trying fallback login endpoint');
            const fallbackResponse = await axiosClient.post('/login/users', {
                ...credentials,
                provider: 'local',
                isMobileApp: true
            });
            const fallbackData = fallbackResponse.data as LoginResponse;

            if (fallbackData.success && fallbackData.token) {
                // Normalize fallback response data as well
                const normalizedUser = normalizeUserData(fallbackData.user);
                const normalizedResponse = {
                    ...fallbackData,
                    user: normalizedUser
                };
                await storeAuthData(fallbackData.token, normalizedUser);
                return normalizedResponse;
            }

            throw new Error('Fallback login failed');
        } catch (fallbackError) {
            console.error('AuthService: Fallback login failed', fallbackError);
            throw error; // Throw the original error
        }
    }
};

/**
 * Store authentication data in AsyncStorage
 */
const storeAuthData = async (token: string, user: User) => {
    try {
        console.log('AuthService: Storing auth data, user:', user);

        // Save token for API requests
        await AsyncStorage.setItem('authToken', token);

        // Save user data
        if (user) {
            const userJson = JSON.stringify(user);
            console.log('AuthService: Storing user data:', userJson);
            await AsyncStorage.setItem('user', userJson);

            // Verify stored data
            const storedUser = await AsyncStorage.getItem('user');
            console.log('AuthService: Verified stored user data:', storedUser);
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
