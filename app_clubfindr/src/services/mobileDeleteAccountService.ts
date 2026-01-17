import axiosClient from '../api/axiosClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Send confirmation code for account deletion
export const sendConfirmationCode = async (email: string): Promise<any> => {
    try {
        // Use the existing web endpoint
        const response = await axiosClient.post('/api/send-delete-confirmation-code', { email });
        return response.data;
    } catch (error) {
        console.error('Failed to send confirmation code:', error);
        throw error;
    }
};

// Confirm deletion and delete account data
export const confirmAccountDeletion = async (email: string, confirmationCode: string): Promise<{ success: boolean, error?: string }> => {
    try {
        const response = await axiosClient.post('/api/delete-user-data', {
            email,
            confirmationCode
        });
        return response.data as { success: boolean, error?: string };
    } catch (error) {
        console.error('Failed to delete account data:', error);
        throw error;
    }
};

// Clean up local storage after account deletion
export const cleanupLocalData = async (): Promise<void> => {
    try {
        // Clear auth data
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('user');
        await AsyncStorage.removeItem('userCity');

        // Clear Spotify data
        await AsyncStorage.removeItem('spotify_access_token');
        await AsyncStorage.removeItem('spotify_refresh_token');
        await AsyncStorage.removeItem('spotify_expiration');
        await AsyncStorage.removeItem('spotifyConnected');
        await AsyncStorage.removeItem('spotifyUser');
        await AsyncStorage.removeItem('spotify_code_verifier');
        await AsyncStorage.removeItem('spotify_client_id');
        await AsyncStorage.removeItem('spotify_client_secret');
        await AsyncStorage.removeItem('spotifyAppName');

        // Clear genre and venue preferences
        await AsyncStorage.removeItem('selected-genres');
        await AsyncStorage.removeItem('spotify-genres');
        await AsyncStorage.removeItem('matching-bars');
        await AsyncStorage.removeItem('matching-clubs');

        // Clear venue caches
        await AsyncStorage.removeItem('venue_data_cache');
        await AsyncStorage.removeItem('club_data_cache');
        await AsyncStorage.removeItem('venue_cache_timestamp');
        await AsyncStorage.removeItem('club_cache_timestamp');

        console.log('Local storage cleaned successfully');
    } catch (error) {
        console.error('Error cleaning local storage:', error);
    }
};

export default {
    sendConfirmationCode,
    confirmAccountDeletion,
    cleanupLocalData
};
