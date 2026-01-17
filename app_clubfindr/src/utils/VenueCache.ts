import AsyncStorage from '@react-native-async-storage/async-storage';
import { Venue } from '../services/discoveryService';

// Cache keys
const VENUE_CACHE_KEY = 'venue_data_nearby_cache';
const CLUB_CACHE_KEY = 'club_data_nearby_cache';
const VENUE_CACHE_TIMESTAMP = 'venue_nearby_cache_timestamp';
const CLUB_CACHE_TIMESTAMP = 'club_nearby_cache_timestamp';

// Cache expiration time - 30 minutes
const CACHE_EXPIRATION = 30 * 60 * 1000;

/**
 * Utility class for caching venue data
 */
export default class VenueCache {
    /**
     * Save venues to cache
     */
    static async saveToCache(venues: Venue[], venueType: 'bar' | 'club'): Promise<void> {
        try {
            const cacheKey = venueType === 'bar' ? VENUE_CACHE_KEY : CLUB_CACHE_KEY;
            const timestampKey = venueType === 'bar' ? VENUE_CACHE_TIMESTAMP : CLUB_CACHE_TIMESTAMP;

            await AsyncStorage.setItem(cacheKey, JSON.stringify(venues));
            await AsyncStorage.setItem(timestampKey, Date.now().toString());
            console.log(`Cached ${venues.length} ${venueType}s for nearby screen`);
        } catch (error) {
            console.error('Error saving venues to cache:', error);
        }
    }

    /**
     * Get venues from cache
     */
    static async getFromCache(venueType: 'bar' | 'club'): Promise<Venue[] | null> {
        try {
            const cacheKey = venueType === 'bar' ? VENUE_CACHE_KEY : CLUB_CACHE_KEY;
            const timestampKey = venueType === 'bar' ? VENUE_CACHE_TIMESTAMP : CLUB_CACHE_TIMESTAMP;

            const cachedData = await AsyncStorage.getItem(cacheKey);
            if (!cachedData) {
                console.log(`No cached ${venueType}s found`);
                return null;
            }

            // Check if cache is expired
            const timestamp = await AsyncStorage.getItem(timestampKey);
            if (!timestamp) {
                console.log(`No timestamp for cached ${venueType}s`);
                return null;
            }

            const cacheTime = parseInt(timestamp);
            const now = Date.now();
            if (now - cacheTime > CACHE_EXPIRATION) {
                console.log(`Cached ${venueType}s are expired`);
                return null;
            }

            const venues = JSON.parse(cachedData) as Venue[];
            console.log(`Retrieved ${venues.length} ${venueType}s from cache`);
            return venues;
        } catch (error) {
            console.error('Error getting venues from cache:', error);
            return null;
        }
    }

    /**
     * Clear the cache for a specific venue type or all venues
     */
    static async clearCache(venueType?: 'bar' | 'club'): Promise<void> {
        try {
            if (!venueType || venueType === 'bar') {
                await AsyncStorage.removeItem(VENUE_CACHE_KEY);
                await AsyncStorage.removeItem(VENUE_CACHE_TIMESTAMP);
                console.log('Bar cache cleared');
            }

            if (!venueType || venueType === 'club') {
                await AsyncStorage.removeItem(CLUB_CACHE_KEY);
                await AsyncStorage.removeItem(CLUB_CACHE_TIMESTAMP);
                console.log('Club cache cleared');
            }
        } catch (error) {
            console.error('Error clearing venue cache:', error);
        }
    }

    /**
     * Check if the cache is valid
     */
    static async isCacheValid(venueType: 'bar' | 'club'): Promise<boolean> {
        try {
            const timestampKey = venueType === 'bar' ? VENUE_CACHE_TIMESTAMP : CLUB_CACHE_TIMESTAMP;
            const timestamp = await AsyncStorage.getItem(timestampKey);

            if (!timestamp) return false;

            const cacheTime = parseInt(timestamp);
            const now = Date.now();
            return (now - cacheTime) < CACHE_EXPIRATION;
        } catch (error) {
            console.error('Error checking cache validity:', error);
            return false;
        }
    }

    /**
     * Get cache age in minutes
     */
    static async getCacheAge(venueType: 'bar' | 'club'): Promise<number | null> {
        try {
            const timestampKey = venueType === 'bar' ? VENUE_CACHE_TIMESTAMP : CLUB_CACHE_TIMESTAMP;
            const timestamp = await AsyncStorage.getItem(timestampKey);

            if (!timestamp) return null;

            const cacheTime = parseInt(timestamp);
            const now = Date.now();
            return Math.floor((now - cacheTime) / 60000); // Convert to minutes
        } catch (error) {
            console.error('Error getting cache age:', error);
            return null;
        }
    }
}