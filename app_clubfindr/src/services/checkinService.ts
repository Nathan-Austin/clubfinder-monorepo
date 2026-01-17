import axiosClient from '../api/axiosClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CheckInResponse {
    success: boolean;
    message: string;
    matchCount?: number;
    venueId?: string;
    venueName?: string;
    checkinCount?: number;
    checkinTime?: string;
    matchedGenres?: string[];
}

export interface CheckInHistory {
    id: string;
    barId: string;
    barName: string;
    checkInTime: string;
    matchCount: number;
    matchedGenres?: string[];
}

/**
 * Process a user check-in by scanning a QR code
 * @param userId User ID from authentication context
 * @param barId Bar ID from QR code
 * @param qrId QR code ID from scan
 * @param qrType QR code type from scan
 * @returns Check-in response from server
 */
export const processCheckIn = async (
    userId: string,
    barId: string,
    qrId: string,
    qrType?: string
): Promise<CheckInResponse> => {
    try {
        const response = await axiosClient.post('/api/mobile/checkin', {
            userId,
            barId,
            qrId,
            qrType: qrType || 'entrance'
        });

        const data = response.data as CheckInResponse;

        if (data.success) {
            // Store the check-in in local history
            await storeCheckInHistory({
                id: `${Date.now()}`,
                barId,
                barName: data.venueName || 'Unknown Venue',
                checkInTime: data.checkinTime || new Date().toISOString(),
                matchCount: data.matchCount || 0,
                matchedGenres: data.matchedGenres
            });
        }

        return data;
    } catch (error) {
        console.error('Error processing check-in:', error);
        throw error;
    }
};

/**
 * Store check-in history in local storage
 * @param checkIn Check-in data to store
 */
export const storeCheckInHistory = async (checkIn: CheckInHistory): Promise<void> => {
    try {
        // Get existing history
        const historyString = await AsyncStorage.getItem('checkin_history');
        const history: CheckInHistory[] = historyString ? JSON.parse(historyString) : [];

        // Add new check-in to the beginning of the array
        history.unshift(checkIn);

        // Keep only the last 50 check-ins
        const trimmedHistory = history.slice(0, 50);

        // Save back to storage
        await AsyncStorage.setItem('checkin_history', JSON.stringify(trimmedHistory));
    } catch (error) {
        console.error('Error storing check-in history:', error);
    }
};

/**
 * Get user's check-in history
 * @param limit Maximum number of history items to return
 * @returns Array of check-in history items
 */
export const getCheckInHistory = async (limit: number = 20): Promise<CheckInHistory[]> => {
    try {
        const historyString = await AsyncStorage.getItem('checkin_history');
        const history: CheckInHistory[] = historyString ? JSON.parse(historyString) : [];
        return history.slice(0, limit);
    } catch (error) {
        console.error('Error retrieving check-in history:', error);
        return [];
    }
};

/**
 * Get check-in count for a specific venue
 * @param barId Bar ID to check
 * @returns Number of check-ins for the venue
 */
export const getVenueCheckInCount = async (barId: string): Promise<number> => {
    try {
        const historyString = await AsyncStorage.getItem('checkin_history');
        const history: CheckInHistory[] = historyString ? JSON.parse(historyString) : [];
        return history.filter(item => item.barId === barId).length;
    } catch (error) {
        console.error('Error counting venue check-ins:', error);
        return 0;
    }
};

/**
 * Parse a Clubfindr QR code URL
 * @param qrData The scanned QR code data string
 * @returns Parsed parameters or null if invalid
 */
export const parseQRCode = (qrData: string): { barId: string; qrId: string; qrType?: string } | null => {
    try {
        // Check if it's our specific QR code format
        if (!qrData.startsWith('clubfindr://checkin')) {
            return null;
        }

        // Parse the URL parameters
        const url = new URL(qrData.replace('clubfindr://', 'https://'));
        const barId = url.searchParams.get('barId');
        const qrId = url.searchParams.get('qrId');
        const qrType = url.searchParams.get('type') || undefined;

        if (!barId || !qrId) {
            return null;
        }

        return { barId, qrId, qrType };
    } catch (error) {
        console.error('Error parsing QR code:', error);
        return null;
    }
};

export default {
    processCheckIn,
    storeCheckInHistory,
    getCheckInHistory,
    getVenueCheckInCount,
    parseQRCode
};