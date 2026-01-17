import { Venue } from './discoveryService';
import VenueCache from '../utils/VenueCache';
import VenueCacheMonitor from '../utils/VenueCacheMonitor';
import * as Location from 'expo-location';

// Local implementation to avoid circular dependencies
const getCurrentLocation = async (): Promise<{ latitude: number, longitude: number } | null> => {
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            console.log('Location permission denied');
            return null;
        }

        try {
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            return {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude
            };
        } catch (error) {
            console.error('Error getting current position:', error);
            try {
                const lastKnownPosition = await Location.getLastKnownPositionAsync();
                if (lastKnownPosition) {
                    return {
                        latitude: lastKnownPosition.coords.latitude,
                        longitude: lastKnownPosition.coords.longitude
                    };
                }
            } catch { }
            console.log('Using default location as fallback');
            return {
                latitude: 52.52,
                longitude: 13.405
            };
        }
    } catch (error) {
        console.error('Error getting location:', error);
        return null;
    }
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;

    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Service to handle local filtering of venues based on distance
 */
export default class LocalVenueFilterService {
    /**
     * Filter venues by distance
     * 
     * @param venues The list of venues to filter
     * @param maxDistance The maximum distance in meters
     * @param venueType The type of venue
     * @returns Filtered venues sorted by distance
     */
    static async filterVenuesByDistance(
        venues: Venue[],
        maxDistance: number,
        venueType: 'bar' | 'club'
    ): Promise<Venue[]> {
        try {
            console.log(`Locally filtering ${venues.length} venues by distance (${maxDistance}m)`);

            // Track performance
            const startTime = Date.now();

            // Get current location
            const location = await getCurrentLocation();
            if (!location) {
                console.log('Could not get current location for local filtering');
                return venues;
            }

            // Process each venue
            const venuesWithDistance = venues.map(venue => {
                // If venue already has coordinates, use them
                if (venue.latitude && venue.longitude) {
                    const distance = calculateDistance(
                        location.latitude,
                        location.longitude,
                        venue.latitude,
                        venue.longitude
                    );

                    return {
                        ...venue,
                        distance
                    };
                }

                // If venue doesn't have coordinates, return as is
                return venue;
            });

            // Filter and sort venues when maxDistance is provided
            if (maxDistance > 0) {
                const filteredVenues = venuesWithDistance.filter(venue => {
                    // Include venues within distance range
                    if (typeof venue.distance === 'number' && venue.distance <= maxDistance) {
                        return true;
                    }
                    // Include venues without distance (no coordinates)
                    if (venue.distance === undefined) {
                        return true;
                    }
                    return false;
                });

                // Sort venues: those with distance first (sorted by distance), then those without distance
                const sortedVenues = filteredVenues.sort((a, b) => {
                    // If both have distance, sort by distance
                    if (typeof a.distance === 'number' && typeof b.distance === 'number') {
                        return a.distance - b.distance;
                    }
                    // If only one has distance, prioritize the one with distance
                    if (typeof a.distance === 'number') return -1;
                    if (typeof b.distance === 'number') return 1;
                    // If neither has distance, maintain original order
                    return 0;
                });

                // Record filtering time
                const filterTime = Date.now() - startTime;
                await VenueCacheMonitor.recordFilterTime(venueType, filterTime);

                console.log(`Filtered to ${sortedVenues.length} venues (${sortedVenues.filter(v => typeof v.distance === 'number').length} with distance) within ${maxDistance}m (took ${filterTime}ms)`);
                return sortedVenues;
            }

            // Record filtering time even if no distance filter
            const filterTime = Date.now() - startTime;
            await VenueCacheMonitor.recordFilterTime(venueType, filterTime);

            // If no maxDistance, just return venues with distance information
            return venuesWithDistance;
        } catch (error) {
            console.error('Error filtering venues by distance:', error);
            return venues;
        }
    }

    /**
     * Get venues with local distance filtering
     * 
     * @param venueType Type of venue (bar or club)
     * @param fetchFunction Function to fetch venues if cache is invalid
     * @param maxDistance Maximum distance in meters
     * @returns Filtered venues
     */
    static async getVenuesWithLocalFiltering(
        venueType: 'bar' | 'club',
        fetchFunction: () => Promise<Venue[]>,
        maxDistance?: number
    ): Promise<Venue[]> {
        try {
            // Try to get venues from cache first
            let venues = await VenueCache.getFromCache(venueType);

            // If no cached venues or cache is invalid, fetch new data
            if (!venues) {
                console.log(`No valid cache found for ${venueType}s, fetching from API`);
                // Record cache miss
                await VenueCacheMonitor.recordCacheMiss(venueType);

                venues = await fetchFunction();

                // Save the fetched data to cache
                if (venues && venues.length > 0) {
                    await VenueCache.saveToCache(venues, venueType);
                }
            } else {
                console.log(`Using cached ${venueType}s (${venues.length} items)`);
                // Record cache hit
                await VenueCacheMonitor.recordCacheHit(venueType);
            }

            // If no distance filter, return the venues as is
            if (!maxDistance || maxDistance <= 0) {
                return venues;
            }

            // Apply distance filtering locally
            return this.filterVenuesByDistance(venues, maxDistance, venueType);
        } catch (error) {
            console.error('Error getting venues with local filtering:', error);
            // Record cache miss due to error
            await VenueCacheMonitor.recordCacheMiss(venueType);

            // If everything fails, try to return the original function result
            return fetchFunction();
        }
    }
}
