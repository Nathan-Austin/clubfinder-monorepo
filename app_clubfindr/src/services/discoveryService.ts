import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import axiosClient from '../api/axiosClient';
import * as Location from 'expo-location';
import LocalVenueFilterService from './localVenueFilterService';
import VenueCache from '../utils/VenueCache';

export type Event = {
    id: string;
    theme_name: string;
    description?: string;
    event_date: string;
    start_time?: string | null;
    end_time?: string | null;
    recurring?: boolean;
    recurrence_pattern?: string | null;
    special_genres?: string[];
    latitude?: number;
    longitude?: number;
    artists?: { id: string; name: string }[];
};

export type Venue = {
    id: string;
    name: string;
    address: string;
    currentTrack?: {
        name: string;
        artist: string;
    };
    genres: string[];
    topGenres?: string[];
    similarity?: number;
    city?: string;
    club_name?: string;
    description?: string;
    openingHours?: string;
    phone?: string;
    latitude?: number;
    longitude?: number;
    venueType?: 'bar' | 'club';
    distance?: number; // in meters
    date?: string;
    // Club-specific fields
    event_name?: string;
    event_date?: string;
    start_time?: string;
    end_time?: string;
    popularity?: string;
    price?: string;
    event_image?: string;
    // New events field
    events?: Event[];
    smoking_allowed?: boolean;
    bar_types?: string[];
    artists?: { id: string; name: string }[];
};

// Cache constants
const VENUE_CACHE_KEY = 'venue_data_cache';
const CLUB_CACHE_KEY = 'club_data_cache';
const VENUE_CACHE_TIMESTAMP = 'venue_cache_timestamp';
const CLUB_CACHE_TIMESTAMP = 'club_cache_timestamp';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Log a request attempt
const logAttempt = async (city: string, venueType: 'bar' | 'club') => {
    try {
        await AsyncStorage.setItem(`${venueType}_last_attempt`, JSON.stringify({
            time: new Date().toISOString(),
            city,
            platform: `${Platform.OS}-${Platform.Version}`
        }));
    } catch (e) {
        console.log(`Failed to log ${venueType} attempt:`, e);
    }
};

// Log a successful request
const logSuccess = async (count: number, venueType: 'bar' | 'club') => {
    try {
        await AsyncStorage.setItem(`${venueType}_last_success`, JSON.stringify({
            time: new Date().toISOString(),
            count
        }));
    } catch (e) {
        console.log(`Failed to log ${venueType} success:`, e);
    }
};

/**
 * Get nearby venues with improved caching and local filtering
 * @param city 
 * @param date 
 * @param maxDistance 
 * @returns Venue[]
 */
export const getNearbyVenuesWithCache = async (city: string, date?: string | null, maxDistance?: number): Promise<Venue[]> => {
    try {
        // Log this request for diagnostics
        console.log(`Getting nearby bars for ${city} with distance filter: ${maxDistance || 'none'}`);

        // Use local venue filter service with a fetch function
        return LocalVenueFilterService.getVenuesWithLocalFiltering(
            'bar',
            // This is the fetch function to use if cache is invalid
            async () => {
                const venues = await getVenues(city, date, 'bar');
                return venues;
            },
            maxDistance
        );
    } catch (error) {
        console.error('Error getting nearby venues with cache:', error);
        // Fallback to original method
        return getNearbyVenues(city, date, maxDistance);
    }
};

/**
 * Get nearby clubs with improved caching and local filtering
 * @param city 
 * @param date 
 * @param maxDistance 
 * @returns Venue[]
 */
export const getNearbyClubsWithCache = async (city: string, date?: string | null, maxDistance?: number): Promise<Venue[]> => {
    try {
        // Log this request for diagnostics
        console.log(`Getting nearby clubs for ${city} with distance filter: ${maxDistance || 'none'}`);

        // Use local venue filter service with a fetch function
        return LocalVenueFilterService.getVenuesWithLocalFiltering(
            'club',
            // This is the fetch function to use if cache is invalid
            async () => {
                const venues = await getVenues(city, date, 'club', undefined, true);
                return venues;
            },
            maxDistance
        );
    } catch (error) {
        console.error('Error getting nearby clubs with cache:', error);
        // Fallback to original method
        return getNearbyClubs(city, date, maxDistance);
    }
};

/**
 * Force refresh the venue cache
 * @param city 
 * @param venueType 
 */
export const refreshVenueCache = async (city: string, venueType: 'bar' | 'club'): Promise<void> => {
    try {
        console.log(`Force refreshing ${venueType} cache for ${city}`);

        // Clear the existing cache
        await VenueCache.clearCache(venueType);

        // Fetch new data
        const venues = await getVenues(city, null, venueType, undefined, venueType === 'club');

        // Save to cache
        if (venues && venues.length > 0) {
            await VenueCache.saveToCache(venues, venueType);
            console.log(`Successfully refreshed ${venueType} cache with ${venues.length} venues`);
        }
    } catch (error) {
        console.error(`Error refreshing ${venueType} cache:`, error);
    }
};

// Save venues to cache
const saveToCache = async (venues: Venue[], venueType: 'bar' | 'club'): Promise<void> => {
    try {
        const cacheKey = venueType === 'bar' ? VENUE_CACHE_KEY : CLUB_CACHE_KEY;
        const timestampKey = venueType === 'bar' ? VENUE_CACHE_TIMESTAMP : CLUB_CACHE_TIMESTAMP;

        await AsyncStorage.setItem(cacheKey, JSON.stringify(venues));
        await AsyncStorage.setItem(timestampKey, Date.now().toString());
        console.log(`Cached ${venues.length} ${venueType}s`);
    } catch (e) {
        console.log('Cache save error:', e);
    }
};

// Get venues from cache
const getFromCache = async (venueType: 'bar' | 'club', ignoreExpiry = false): Promise<Venue[] | null> => {
    try {
        const cacheKey = venueType === 'bar' ? VENUE_CACHE_KEY : CLUB_CACHE_KEY;
        const timestampKey = venueType === 'bar' ? VENUE_CACHE_TIMESTAMP : CLUB_CACHE_TIMESTAMP;

        const cachedJson = await AsyncStorage.getItem(cacheKey);
        if (!cachedJson) return null;

        const venues = JSON.parse(cachedJson) as Venue[];

        // Check expiry unless we're explicitly ignoring it
        if (!ignoreExpiry) {
            const timestamp = await AsyncStorage.getItem(timestampKey);
            if (!timestamp) return null;

            const cacheTime = parseInt(timestamp);
            if (Date.now() - cacheTime > CACHE_DURATION) {
                console.log('Cache expired, should refresh');
                return null;
            }
        }

        console.log(`Retrieved ${venues.length} ${venueType}s from cache`);
        return venues;
    } catch (e) {
        console.log('Cache read error:', e);
        return null;
    }
};


/**
 * Get events for a venue, handling both bars and clubs
 * @param venueId The ID of the venue
 * @param name The name of the venue
 * @param venueType The type of venue ('bar' or 'club')
 * @returns Array of Event objects
 */
export const getVenueEvents = async (venueId: string, venueType: 'bar' | 'club', venueName?: string, clubName?: string): Promise<Event[]> => {
    try {
        console.log(`Fetching events for ${venueType} ID: ${venueId}`);

        if (venueType === 'bar') {
            // For bars, use the bars endpoint
            const response = await axiosClient.get(`/api/mobile/bars/${venueId}/events`);

            // Get events data from response
            const eventsArray = response.data?.events && Array.isArray(response.data.events)
                ? response.data.events
                : [];

            console.log(`Received ${eventsArray.length} events for bar ${venueId}`);

            // Format the events
            return eventsArray.map((event: any) => ({
                id: event.id || `event-${Math.random()}`,
                theme_name: event.theme_name || 'Event',
                description: event.description || '',
                event_date: event.event_date || new Date().toISOString().split('T')[0],
                start_time: event.start_time || null,
                end_time: event.end_time || null,
                recurring: !!event.recurring,
                recurrence_pattern: event.recurrence_pattern || null,
                special_genres: event.special_genres || []
            }));
        } else {
            // For clubs, we need to get all events from the club
            
            // 1. Try using club_name if available (Most reliable for our API structure)
            if (clubName) {
                try {
                    console.log(`Attempting to fetch club events for club_name: ${clubName}`);
                    const response = await axiosClient.get(`/api/mobile/clubs/${encodeURIComponent(clubName)}`);

                    if (response.data && Array.isArray(response.data)) {
                        console.log(`Received ${response.data.length} events for club ${clubName}`);
                        return response.data.map((event: any) => ({
                            id: event.id || `event-${Math.random()}`,
                            theme_name: event.name || event.event_name || 'Event',
                            description: event.description || '',
                            event_date: event.date || event.event_date || new Date().toISOString().split('T')[0],
                            start_time: event.start_time || null,
                            end_time: event.end_time || null,
                            recurring: false,
                            recurrence_pattern: null,
                            special_genres: Array.isArray(event.genres) ? event.genres : [],
                            artists: Array.isArray(event.artists) ? event.artists : []
                        }));
                    }
                } catch (clubError) {
                    console.error(`Error fetching club events by club_name:`, clubError);
                }
            }

            // 2. Try to get events for this club using the ID (might be event ID, so might fail if API expects club name)
            // Using /clubs/ endpoint as /events/ might be incorrect for fetching club specific events list
            
            try {
                console.log(`Attempting to fetch club events from /api/mobile/clubs/${venueId}`);
                const response = await axiosClient.get(`/api/mobile/clubs/${venueId}`);

                if (response.data) {
                    let eventsData: any[] = [];
                    
                    if (Array.isArray(response.data)) {
                        eventsData = response.data;
                    } else if (response.data.events && Array.isArray(response.data.events)) {
                        eventsData = response.data.events;
                    } else {
                        // If it's a single object without events array, treat it as the event itself
                        eventsData = [response.data];
                    }

                    console.log(`Retrieved ${eventsData.length} events for club ${venueId} from /clubs/ endpoint`);

                    if (eventsData.length > 0) {
                        return eventsData.map((event: any) => ({
                            id: event.id || `event-${Math.random()}`,
                            theme_name: event.name || event.event_name || 'Event',
                            description: event.description || '',
                            event_date: event.date || event.event_date || new Date().toISOString().split('T')[0],
                            start_time: event.start_time || null,
                            end_time: event.end_time || null,
                            recurring: false,
                            recurrence_pattern: null,
                            special_genres: Array.isArray(event.genres) ? event.genres : []
                        }));
                    } else {
                         console.log('ID fetch returned empty array, falling back to other methods');
                    }
                } else {
                    console.log('ID fetch returned no data');
                }
            } catch (eventError) {
                console.log(`Fetching club events by ID failed, trying by name... Error: ${eventError}`);
            }

            // If we couldn't get events from the events endpoint by ID, try using the club name
            if (venueName) {
                try {
                    const response = await axiosClient.get(`/api/mobile/clubs/${encodeURIComponent(venueName)}`);

                    if (response.data && Array.isArray(response.data)) {
                        console.log(`Received ${response.data.length} events for club ${venueName}`);

                        // Format the club events
                        return response.data.map((event: any) => ({
                            id: event.id || `event-${Math.random()}`,
                            theme_name: event.name || event.event_name || 'Event',
                            description: event.description || '',
                            event_date: event.date || event.event_date || new Date().toISOString().split('T')[0],
                            start_time: event.start_time || null,
                            end_time: event.end_time || null,
                            recurring: false, // Clubs typically don't have recurring events in the same way as bars
                            recurrence_pattern: null,
                            special_genres: Array.isArray(event.genres) ? event.genres : []
                        }));
                    }
                } catch (clubError) {
                    console.error(`Error fetching club events from endpoint:`, clubError);
                    // Fall through to the next approach if this fails
                }
            }

            // If everything else failed, use the current event from the venue object if available
            if (venueId && venueType === 'club') {
                console.log(`Using current event from club object as fallback`);
                const today = new Date().toISOString().split('T')[0];

                return [{
                    id: venueId,
                    theme_name: 'Event',
                    description: '',
                    event_date: today,
                    start_time: null,
                    end_time: null,
                    recurring: false,
                    recurrence_pattern: null,
                    special_genres: []
                }];
            }

            // If we got here, we couldn't get any events
            console.log(`No events found for club ${venueId}`);
            return [];
        }
    } catch (error) {
        console.error(`Error in getVenueEvents for ${venueType} ${venueId}:`, error);
        return [];
    }
};
/**
* Fetch events for a specific club (Legacy function, use getVenueEvents instead)
* @param clubId The ID of the club
* @returns Array of Event objects
*/
export const getClubEvents = async (clubId: string, clubName?: string): Promise<Event[]> => {
    return getVenueEvents(clubId, 'club', clubName);
};

// Function to check location permission status without requesting
export const checkLocationPermission = async (): Promise<'granted' | 'denied' | 'undetermined'> => {
    try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') return 'granted';
        if (status === 'denied') return 'denied';
        return 'undetermined';
    } catch (error) {
        console.error('Error checking location permission:', error);
        return 'denied';
    }
};

// Function to request location permission and get current location
export const getCurrentLocation = async (): Promise<{ latitude: number, longitude: number } | null> => {
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

            // Fallback to last known position if available
            try {
                const lastKnownPosition = await Location.getLastKnownPositionAsync();
                if (lastKnownPosition) {
                    return {
                        latitude: lastKnownPosition.coords.latitude,
                        longitude: lastKnownPosition.coords.longitude
                    };
                }
            } catch { }

            // Final fallback - use a default location
            console.log('Using default location as fallback');
            return {
                latitude: 52.52, // Berlin coordinates as default
                longitude: 13.405
            };
        }
    } catch (error) {
        console.error('Error getting location:', error);
        return null;
    }
};

// Helper function to geocode an address to coordinates
export const geocodeAddress = async (address: string): Promise<{ latitude: number, longitude: number } | null> => {
    try {
        const results = await Location.geocodeAsync(address);
        if (results && results.length > 0) {
            return {
                latitude: results[0].latitude,
                longitude: results[0].longitude
            };
        }
        return null;
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
};

// Calculate distance between two coordinates in meters
export const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;

    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // distance in meters
};

// Use direct fetch API with error handling
const tryDirectFetch = async (
    city: string,
    date: string,
    endpoint: string
): Promise<Venue[]> => {
    console.log(`Attempting direct fetch API for ${endpoint}...`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased timeout

        // Get auth token if available
        const token = await AsyncStorage.getItem('authToken');
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Connection': 'close',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            // Add a unique identifier to prevent any caching
            'X-Request-ID': Date.now().toString()
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Add platform info
        headers['User-Agent'] = `ClubFindr-Mobile/${Platform.OS}-${Platform.Version}`;

        // Add timestamp parameter to URL to prevent caching
        const cacheBuster = `_t=${Date.now()}`;
        const url = `https://www.clubfindr.com${endpoint}?${cacheBuster}`;

        console.log('Direct fetch URL:', url);
        console.log('Direct fetch headers:', JSON.stringify(headers));

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ city, date }),
            signal: controller.signal,
            // Explicitly disable caching
            cache: 'no-store' as RequestCache
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        // Log response headers to debug content type
        console.log('Response headers:', {
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length')
        });

        const responseText = await response.text();
        console.log('Direct fetch response length:', responseText.length);
        console.log('Response preview:', responseText.substring(0, 100));

        // Try to detect if we got HTML/text instead of JSON
        if (responseText.trim().startsWith('<') || responseText.trim().startsWith('T')) {
            console.error('Received non-JSON response:', responseText.substring(0, 200));
            throw new Error('Invalid response format - expected JSON');
        }

        try {
            const data = JSON.parse(responseText);
            if (!Array.isArray(data)) {
                console.error('Response is not an array:', data);
                throw new Error('Response is not an array');
            }

            console.log(`Direct fetch success! Got ${data.length} venues`);
            return data as Venue[];
        } catch (parseError) {
            console.error('Failed to parse JSON response:', parseError);
            console.log('Response preview:', responseText.substring(0, 200));
            throw new Error('Invalid JSON response');
        }
    } catch (error) {
        console.log('Direct fetch failed:', error);
        throw error;
    }
};

// Process venues to add coordinates and distance info
// Modified processVenues function for discoveryService.ts
const processVenues = async (
    venues: Venue[],
    venueType: 'bar' | 'club',
    maxDistance?: number
): Promise<Venue[]> => {
    console.log(`Processing ${venues.length} ${venueType}s${maxDistance ? ' with distance filter' : ''}`);

    // Add venue type to each venue
    const venuesWithType = venues.map(venue => ({
        ...venue,
        venueType
    }));

    // If no distance filter, return venues with type only
    if (!maxDistance || maxDistance <= 0) {
        console.log('No distance filtering applied');
        return venuesWithType;
    }

    // Get user location for distance calculation
    console.log('Getting current location for distance filtering...');
    const userLocation = await getCurrentLocation();
    if (!userLocation) {
        console.log('Could not get user location for distance filtering - returning all venues');
        return venuesWithType;
    }

    console.log(`Got user location: ${userLocation.latitude}, ${userLocation.longitude}`);

    // Process each venue with geocoding and distance calculation
    console.log(`Processing distances for ${venuesWithType.length} venues`);
    let venuesWithCoordinates = 0;
    let venuesWithDistance = 0;
    let venuesNeedingGeocoding = 0;
    let geocodingSuccessful = 0;

    const processedVenues = await Promise.all(
        venuesWithType.map(async (venue) => {
            // Create a copy of the venue to avoid mutating the original
            const processedVenue = { ...venue };

            // Check if venue already has coordinates
            if (processedVenue.latitude && processedVenue.longitude) {
                venuesWithCoordinates++;

                // Calculate distance if we have coordinates
                processedVenue.distance = calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    processedVenue.latitude,
                    processedVenue.longitude
                );
                venuesWithDistance++;

                return processedVenue;
            }

            // Try to get coordinates from event if available
            if (processedVenue.events && processedVenue.events.length > 0) {
                // Find first event with coordinates
                const eventWithCoords = processedVenue.events.find(event =>
                    event.latitude && event.longitude
                );

                if (eventWithCoords && eventWithCoords.latitude && eventWithCoords.longitude) {
                    processedVenue.latitude = eventWithCoords.latitude;
                    processedVenue.longitude = eventWithCoords.longitude;

                    venuesWithCoordinates++;

                    // Calculate distance
                    processedVenue.distance = calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        processedVenue.latitude,
                        processedVenue.longitude
                    );
                    venuesWithDistance++;

                    return processedVenue;
                }
            }

            // Try to geocode the address if no coordinates are available
            venuesNeedingGeocoding++;
            try {
                const addressToGeocode = processedVenue.address && processedVenue.address.trim()
                    ? `${processedVenue.address}, ${processedVenue.city || 'Berlin'}`
                    : `${processedVenue.name}, ${processedVenue.city || 'Berlin'}`;

                console.log(`Geocoding address: ${addressToGeocode}`);
                const coordinates = await geocodeAddress(addressToGeocode);

                if (coordinates && coordinates.latitude && coordinates.longitude) {
                    processedVenue.latitude = coordinates.latitude;
                    processedVenue.longitude = coordinates.longitude;
                    venuesWithCoordinates++;
                    geocodingSuccessful++;

                    // Calculate distance
                    processedVenue.distance = calculateDistance(
                        userLocation.latitude,
                        userLocation.longitude,
                        coordinates.latitude,
                        coordinates.longitude
                    );
                    venuesWithDistance++;

                    console.log(`Geocoded ${processedVenue.name}: ${coordinates.latitude}, ${coordinates.longitude}, distance: ${processedVenue.distance}m`);
                } else {
                    console.log(`Failed to geocode address for ${processedVenue.name}`);
                }
            } catch (error) {
                console.error(`Error geocoding address for ${venue.name}:`, error);
            }

            return processedVenue;
        })
    );

    console.log(`Venues with original coordinates: ${venuesWithCoordinates}/${venuesWithType.length}`);
    console.log(`Venues needing geocoding: ${venuesNeedingGeocoding}`);
    console.log(`Successful geocoding: ${geocodingSuccessful}/${venuesNeedingGeocoding}`);
    console.log(`Total venues with distance: ${venuesWithDistance}/${venuesWithType.length}`);

    // Important fix: Change the filter logic
    // Instead of filtering out venues without distance, include them
    // when distance filtering is applied but geocoding failed
    const filteredVenues = processedVenues.filter(venue => {
        // Include venues within distance range
        if (typeof venue.distance === 'number' && venue.distance <= maxDistance) {
            return true;
        }

        // For venues without distance (geocoding failed), include them anyway
        // but they'll appear after the ones with distance due to sorting below
        if (venue.distance === undefined) {
            console.log(`Including venue without distance: ${venue.name}`);
            return true;
        }

        return false;
    });

    console.log(`After filtering: ${filteredVenues.length}/${processedVenues.length} venues remain`);

    // Sort venues with distance first, then venues without distance
    return filteredVenues.sort((a, b) => {
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
};

// Main function to get venues
export const getVenues = async (
    city: string,
    date: string | null = null,
    venueType: 'bar' | 'club' = 'bar',
    maxDistance?: number,
    isNearbyMode: boolean = false
): Promise<Venue[]> => {
    console.log(`Fetching nearby ${venueType}s with:`, { city, date, distanceFilter: maxDistance ? true : false, isNearbyMode });

    // Log this attempt
    await logAttempt(city, venueType);

    // Strategy 1: Try to get from cache first for instant response
    const cachedVenues = await getFromCache(venueType);
    if (cachedVenues && cachedVenues.length > 0) {
        // Background refresh
        setTimeout(() => refreshVenues(city, date, venueType, isNearbyMode), 100);

        // Process cached venues with distance info
        if (maxDistance && maxDistance > 0) {
            const processedVenues = await processVenues(cachedVenues, venueType, maxDistance);
            return processedVenues;
        }

        return cachedVenues;
    }

    // Determine the API endpoint based on venue type
    const endpoint = venueType === 'bar' ? '/api/mobile/bars' : '/api/mobile/events';

    // Prepare the request data
    const requestData: any = { city };

    // For clubs when isNearbyMode is true, send the nearby flag
    if (venueType === 'club' && isNearbyMode) {
        requestData.nearby = true;
    }
    // Otherwise add date if it's provided
    else if (date) {
        requestData.date = date;
    }

    // Attempt to fetch venues
    try {
        console.log(`Fetching ${venueType}s from endpoint: ${endpoint}`, requestData);

        // Use axiosClient
        const response = await axiosClient.post(endpoint, requestData);
        const venues = response.data as Venue[];

        if (venues && venues.length > 0) {
            // Process venues with type, coordinates and distance
            const processedVenues = await processVenues(venues, venueType, maxDistance);

            // Save to cache
            await saveToCache(processedVenues, venueType);
            await logSuccess(processedVenues.length, venueType);

            return processedVenues;
        }
    } catch (error) {
        console.error(`Error fetching ${venueType}s from primary endpoint:`, error);

    }

    // If all network strategies failed, try expired cache
    const expiredCache = await getFromCache(venueType, true);
    if (expiredCache && expiredCache.length > 0) {
        console.log(`Using expired ${venueType} cache as fallback`);

        // Process expired cache with distance info
        if (maxDistance && maxDistance > 0) {
            const processedVenues = await processVenues(expiredCache, venueType, maxDistance);
            return processedVenues;
        }

        return expiredCache;
    }

    // Final fallback: Return hardcoded data
    console.log(`All approaches failed, using fallback ${venueType} data`);
    return venueType === 'bar' ? getFallbackBars() : getFallbackClubs();
};

// Also update the refreshVenues function to match
const refreshVenues = async (
    city: string,
    date: string | null,
    venueType: 'bar' | 'club',
    isNearbyMode: boolean = false
) => {
    const endpoint = venueType === 'bar' ? '/api/mobile/bars' : '/api/mobile/events';

    // Prepare the request data
    const requestData: any = { city };

    // For clubs when isNearbyMode is true, send the nearby flag
    if (venueType === 'club' && isNearbyMode) {
        requestData.nearby = true;
    }
    // Otherwise add date if it's provided
    else if (date) {
        requestData.date = date;
    }

    try {
        const response = await axiosClient.post(endpoint, requestData);
        const venues = response.data as Venue[];
        if (venues && venues.length > 0) {
            // Process venues with type
            const processedVenues = await processVenues(venues, venueType);

            await saveToCache(processedVenues, venueType);
            await logSuccess(venues.length, venueType);
            console.log(`Background refresh of ${venueType}s successful`);
        }
    } catch (error) {
        console.log(`Background refresh of ${venueType}s failed:`, error);
    }
};



// Get nearby venues (legacy function name, uses bars by default)
export const getNearbyVenues = (city: string, date?: string | null, maxDistance?: number): Promise<Venue[]> => {
    // For bars, we can safely pass a null date
    return getVenues(city, date || '', 'bar', maxDistance);
};

export const getNearbyClubs = (city: string, date?: string | null, maxDistance?: number): Promise<Venue[]> => {
    // For clubs, set isNearbyMode to true when not using a date filter
    const isNearbyMode = !date;
    return getVenues(city, date || null, 'club', maxDistance, isNearbyMode);
};

export const getMatchingVenues = async (city: string, date: string): Promise<Venue[]> => {
    try {
        const response = await axiosClient.get('/api/venues/matching', { params: { city, date } });
        return response.data as Venue[];
    } catch (error) {
        console.error('Failed to fetch matching venues:', error);
        return [];
    }
};

export const getVenueDetails = async (id: string, venueType: 'bar' | 'club' = 'bar'): Promise<Venue | null> => {
    const endpoint = venueType === 'bar' ? `/api/mobile/bars/${id}` : `/api/mobile/events/${id}`;
    console.log(`Fetching details for ${venueType} with ID: ${id} from endpoint: ${endpoint}`);

    try {
        // First, try the native fetch
        try {
            const response = await axiosClient.get(endpoint);
            console.log(`Response received for ${venueType} details, status:`,
                response.status || 'unknown');

            if (response.data && response.data.bar) {
                // Some endpoints return the venue inside a 'bar' property
                return response.data.bar as Venue;
            } else if (response.data && response.data.event) {
                // Some endpoints return the venue inside an 'event' property
                return response.data.event as Venue;
            } else if (response.data) {
                // Sometimes the venue is the direct response
                return response.data as Venue;
            }
        } catch (apiError) {
            console.warn(`Error fetching ${venueType} details from primary endpoint:`, apiError);
            // Continue to fallback approach
        }

        // Fallback: Try to use the direct URL fetch instead of axios for robustness
        try {
            console.log(`Using fallback direct fetch for ${venueType} details`);
            const token = await AsyncStorage.getItem('authToken');
            const cacheBuster = `_t=${Date.now()}`;

            const url = `https://www.clubfindr.com${endpoint}?${cacheBuster}`;
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            const data = await response.json();
            console.log(`Direct fetch success for ${venueType} details`);

            // Handle the different response formats as above
            if (data && data.bar) {
                return data.bar as Venue;
            } else if (data && data.event) {
                return data.event as Venue;
            } else if (data) {
                return data as Venue;
            }
        } catch (directFetchError) {
            console.error(`Direct fetch also failed for ${venueType} details:`, directFetchError);
        }

        // If we reach here, we couldn't get the details from either approach
        console.log(`Could not fetch ${venueType} details, trying to find in cached venues`);

        // Try to find the venue in the cache
        const cachedVenuesJson = await AsyncStorage.getItem(
            venueType === 'bar' ? 'venue_data_cache' : 'club_data_cache'
        );

        if (cachedVenuesJson) {
            const cachedVenues = JSON.parse(cachedVenuesJson) as Venue[];
            const cachedVenue = cachedVenues.find(v => v.id === id);

            if (cachedVenue) {
                console.log(`Found ${venueType} in cache, returning cached data`);
                return cachedVenue;
            }
        }

        // No data available from any source
        console.error(`Failed to fetch ${venueType} details from all sources`);
        return null;
    } catch (error) {
        console.error(`Error in getVenueDetails for ${venueType}:`, error);
        return null;
    }
};

// Get diagnostic info about venue requests
export const getVenueRequestDiagnostics = async (): Promise<any> => {
    try {
        const barAttemptJson = await AsyncStorage.getItem('bar_last_attempt');
        const barSuccessJson = await AsyncStorage.getItem('bar_last_success');
        const clubAttemptJson = await AsyncStorage.getItem('club_last_attempt');
        const clubSuccessJson = await AsyncStorage.getItem('club_last_success');
        const barTimestamp = await AsyncStorage.getItem(VENUE_CACHE_TIMESTAMP);
        const clubTimestamp = await AsyncStorage.getItem(CLUB_CACHE_TIMESTAMP);

        let barCacheAge = 'No cache';
        if (barTimestamp) {
            const ageMinutes = Math.round((Date.now() - parseInt(barTimestamp)) / 60000);
            barCacheAge = `${ageMinutes} minutes old`;
        }

        let clubCacheAge = 'No cache';
        if (clubTimestamp) {
            const ageMinutes = Math.round((Date.now() - parseInt(clubTimestamp)) / 60000);
            clubCacheAge = `${ageMinutes} minutes old`;
        }

        return {
            bars: {
                lastAttempt: barAttemptJson ? JSON.parse(barAttemptJson) : 'Never',
                lastSuccess: barSuccessJson ? JSON.parse(barSuccessJson) : 'Never',
                cacheAge: barCacheAge
            },
            clubs: {
                lastAttempt: clubAttemptJson ? JSON.parse(clubAttemptJson) : 'Never',
                lastSuccess: clubSuccessJson ? JSON.parse(clubSuccessJson) : 'Never',
                cacheAge: clubCacheAge
            },
            currentPlatform: `${Platform.OS}-${Platform.Version}`
        };
    } catch (error) {
        return { error: 'Failed to get diagnostics' };
    }
};

// Clear venue cache
export const clearVenueCache = async (venueType?: 'bar' | 'club'): Promise<void> => {
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
};

// Fallback bars
export const getFallbackBars = (): Venue[] => {
    return [
        {
            id: '1',
            name: 'Club XYZ',
            address: '123 Main St, Berlin',
            genres: ['House', 'Techno', 'Electronic'],
            currentTrack: {
                name: 'Strobe',
                artist: 'Deadmau5'
            },
            similarity: 0.85,
            venueType: 'bar'
        },
        {
            id: '2',
            name: 'Groove Lounge',
            address: '456 Park Ave, Berlin',
            genres: ['Hip Hop', 'R&B', 'Soul'],
            currentTrack: {
                name: 'Gin & Juice',
                artist: 'Snoop Dogg'
            },
            similarity: 0.72,
            venueType: 'bar'
        },
        {
            id: '3',
            name: 'Rhythm Room',
            address: '789 Broadway, Berlin',
            genres: ['Jazz', 'Blues', 'Funk'],
            currentTrack: {
                name: 'Take Five',
                artist: 'Dave Brubeck'
            },
            similarity: 0.65,
            venueType: 'bar'
        },
        {
            id: '4',
            name: 'Tresor',
            address: 'Köpenicker Str. 70, Berlin',
            genres: ['Techno', 'Industrial', 'Electronic'],
            currentTrack: {
                name: 'Spastik',
                artist: 'Plastikman'
            },
            similarity: 0.91,
            venueType: 'bar'
        },
        {
            id: '5',
            name: 'Berghain',
            address: 'Am Wriezener Bahnhof, Berlin',
            genres: ['Techno', 'House', 'Minimal'],
            currentTrack: {
                name: 'The Bells',
                artist: 'Jeff Mills'
            },
            similarity: 0.89,
            venueType: 'bar'
        }
    ];
};

// Fallback clubs
export const getFallbackClubs = (): Venue[] => {
    return [
        {
            id: 'c1',
            name: 'Matrix Club',
            address: 'Warschauer Platz 18, Berlin',
            genres: ['Techno', 'House', 'EDM'],
            similarity: 0.93,
            venueType: 'club',
            event_name: 'Techno Tuesday',
            event_date: '2025-03-18',
            start_time: '22:00',
            end_time: '05:00',
            popularity: 'High',
            price: '15€'
        },
        {
            id: 'c2',
            name: 'Watergate',
            address: 'Falckensteinstraße 49, Berlin',
            genres: ['Deep House', 'Tech House', 'Minimal'],
            similarity: 0.87,
            venueType: 'club',
            event_name: 'Deep Vibes',
            event_date: '2025-03-20',
            start_time: '23:00',
            end_time: '08:00',
            popularity: 'Medium',
            price: '18€'
        },
        {
            id: 'c3',
            name: 'Sisyphos',
            address: 'Hauptstraße 15, Berlin',
            genres: ['Techno', 'Electronic', 'Experimental'],
            similarity: 0.78,
            venueType: 'club',
            event_name: 'Endless Night',
            event_date: '2025-03-21',
            start_time: '00:00',
            end_time: '12:00',
            popularity: 'High',
            price: '20€'
        },
        {
            id: 'c4',
            name: 'YAAM',
            address: 'An der Schillingbrücke 3, Berlin',
            genres: ['Reggae', 'Dancehall', 'Hip Hop'],
            similarity: 0.69,
            venueType: 'club',
            event_name: 'Reggae Beach',
            event_date: '2025-03-19',
            start_time: '18:00',
            end_time: '02:00',
            popularity: 'Medium',
            price: '10€'
        },
        {
            id: 'c5',
            name: 'Ritter Butzke',
            address: 'Ritterstraße 26, Berlin',
            genres: ['House', 'Techno', 'Disco'],
            similarity: 0.82,
            venueType: 'club',
            event_name: 'Saturday Night Fever',
            event_date: '2025-03-22',
            start_time: '23:59',
            end_time: '10:00',
            popularity: 'High',
            price: '16€'
        }
    ];
};

// Add this to your discovery service
export const testLocationServices = async () => {
    try {
        console.log('Testing location services...');

        // Check permissions
        const permissionStatus = await Location.getForegroundPermissionsAsync();
        console.log('Permission status:', permissionStatus);

        if (permissionStatus.status !== 'granted') {
            console.log('Requesting permissions...');
            const request = await Location.requestForegroundPermissionsAsync();
            console.log('Permission request result:', request);
        }

        // Try to get location
        console.log('Getting current position...');
        const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced
        });
        console.log('Got position:', position);

        return {
            success: true,
            position: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            }
        };
    } catch (error) {
        console.error('Location test failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};


import * as genreMatchingService from './genreMatchingService';

/**
 * Process user genres and find venues for a specific date
 * @param userGenres Array of genre strings
 * @param date Date string in YYYY-MM-DD format
 * @param venueType 'bar' or 'club'
 * @returns Array of matching venues
 */
export const processUserGenresAndFindVenuesForDate = async (
    userGenres: string[],
    date: string,
    venueType: 'bar' | 'club' = 'bar'
): Promise<Venue[]> => {
    try {
        // Get city from storage or use default
        const city = await AsyncStorage.getItem('userCity') || 'berlin';

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.error(`Invalid date format: ${date}`);
            throw new Error('Invalid date format. Expected YYYY-MM-DD');
        }

        console.log(`Finding ${venueType}s matching ${userGenres.length} genres for date: ${date}`);

        // Store the genres in AsyncStorage
        await AsyncStorage.setItem('selected-genres', userGenres.join(','));

        // Try to use our backend API for the specified date
        try {
            const endpoint = venueType === 'bar'
                ? '/api/mobile/bars/matching'
                : '/api/mobile/events/matching';

            const response = await axiosClient.post(endpoint, {
                city,
                date,
                genres: userGenres
            });
            const matchingVenues = response.data;

            if (matchingVenues && Array.isArray(matchingVenues) && matchingVenues.length > 0) {
                console.log(`Found ${matchingVenues.length} matching ${venueType}s for date ${date}`);
                return matchingVenues as Venue[];
            }

            console.log(`No matching ${venueType}s returned from API for date ${date}`);
            return [];
        } catch (apiError) {
            console.error(`API matching failed for date ${date}:`, apiError);

            // Fallback to local matching if API call fails
            const endpoint = venueType === 'bar'
                ? '/api/mobile/bars'
                : '/api/mobile/events';

            try {
                const response = await axiosClient.post(endpoint, {
                    city,
                    date
                });
                const allVenues = response.data;

                if (!allVenues || !Array.isArray(allVenues) || allVenues.length === 0) {
                    console.log(`No ${venueType}s found for date ${date}`);
                    return [];
                }

                // Try local matching logic as a last resort
                return genreMatchingService.findMatchingVenues(userGenres, allVenues as Venue[], venueType);
            } catch (fallbackError) {
                console.error(`Fallback ${venueType} fetching failed for date ${date}:`, fallbackError);
                return [];
            }
        }
    } catch (error) {
        console.error(`Error processing user genres for date ${date}:`, error);
        throw error;
    }
};

/**
 * Get venues for a date range (for weekly/weekend views)
 * @param startDate Start date in YYYY-MM-DD format
 * @param endDate End date in YYYY-MM-DD format
 * @param venueType 'bar' or 'club'
 * @returns Array of venues across the date range
 */
export const getVenuesForDateRange = async (
    startDate: string,
    endDate: string,
    venueType: 'bar' | 'club' = 'bar'
): Promise<Venue[]> => {
    try {
        // Get stored genres
        const genres = await AsyncStorage.getItem('selected-genres');
        if (!genres) {
            console.log('No genres found for venue recommendations');
            return [];
        }

        const genresList = genres.split(',');

        // Get city
        const city = await AsyncStorage.getItem('userCity') || 'berlin';

        // Create date range
        const start = new Date(startDate);
        const end = new Date(endDate);
        const dateRange: string[] = [];

        // Generate all dates in the range
        const currentDate = new Date(start);
        while (currentDate <= end) {
            dateRange.push(formatDate(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        console.log(`Fetching ${venueType}s for date range: ${startDate} to ${endDate}`);

        // Fetch venues for each date in the range
        const venuesPromises = dateRange.map(date => {
            const endpoint = venueType === 'bar'
                ? '/api/mobile/bars/matching'
                : '/api/mobile/events/matching';

            return axiosClient.post(endpoint, {
                city,
                date,
                genres: genresList
            }).catch(error => {
                console.error(`Error fetching ${venueType}s for date ${date}:`, error);
                return { data: [] };
            });
        });

        const responses = await Promise.all(venuesPromises);

        // Combine venues from all dates, remove duplicates
        const allVenues: Venue[] = [];
        const venueIds = new Set<string>();

        responses.forEach(response => {
            const venues = response.data;
            if (venues && Array.isArray(venues)) {
                venues.forEach((venue: Venue) => {
                    if (venue.id && !venueIds.has(venue.id)) {
                        venueIds.add(venue.id);
                        allVenues.push(venue);
                    }
                });
            }
        });

        console.log(`Found ${allVenues.length} unique ${venueType}s across date range`);

        // Sort by similarity if available
        return allVenues.sort((a, b) => {
            if (typeof a.similarity === 'number' && typeof b.similarity === 'number') {
                return b.similarity - a.similarity;
            }
            return 0;
        });
    } catch (error) {
        console.error(`Error fetching venues for date range:`, error);
        return [];
    }
};

/**
 * Helper function to format a date as YYYY-MM-DD
 */
const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Get weekend dates (Friday, Saturday, Sunday) from a given date
 * @param startDate Date to get the weekend for
 * @returns Object with start and end dates
 */
export const getWeekendDates = (startDate: Date = new Date()): { startDate: string, endDate: string } => {
    const currentDay = startDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Find the nearest Friday
    const fridayOffset = currentDay === 5 ? 0 : // It's Friday
        currentDay === 6 ? -1 : // It's Saturday, get yesterday
            currentDay === 0 ? -2 : // It's Sunday, get 2 days ago
                5 - currentDay; // It's Monday-Thursday, get next Friday

    const friday = new Date(startDate);
    friday.setDate(startDate.getDate() + fridayOffset);

    // Get Sunday (2 days after Friday)
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);

    return {
        startDate: formatDate(friday),
        endDate: formatDate(sunday)
    };
};

/**
 * Get week dates (7 days) from a given date
 * @param startDate Date to get the week for
 * @returns Object with start and end dates
 */
export const getWeekDates = (startDate: Date = new Date()): { startDate: string, endDate: string } => {
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // 7 days total (including start date)

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };
};

/**
 * Helper function to convert a date selection to actual dates
 * @param selection Selected date option (e.g., 'today', 'this-weekend', etc.)
 * @returns Object with start and end dates
 */
export const getDateRangeFromSelection = (selection: string): { startDate: string, endDate: string } => {
    const today = new Date();

    switch (selection) {
        case 'today':
            const todayStr = formatDate(today);
            return { startDate: todayStr, endDate: todayStr };

        case 'tomorrow':
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const tomorrowStr = formatDate(tomorrow);
            return { startDate: tomorrowStr, endDate: tomorrowStr };

        case 'this-week':
            return getWeekDates(today);

        case 'this-weekend':
            return getWeekendDates(today);

        case 'next-week':
            const nextWeekStart = new Date(today);
            nextWeekStart.setDate(today.getDate() + 7);
            return getWeekDates(nextWeekStart);

        case 'next-weekend':
            const nextWeekendStart = new Date(today);
            nextWeekendStart.setDate(today.getDate() + 7);
            return getWeekendDates(nextWeekendStart);

        default:
            // If the selection is a specific date, use that date
            if (selection && /^\d{4}-\d{2}-\d{2}$/.test(selection)) {
                return { startDate: selection, endDate: selection };
            }

            // Default to today
            const defaultDate = formatDate(today);
            return { startDate: defaultDate, endDate: defaultDate };
    }
};
