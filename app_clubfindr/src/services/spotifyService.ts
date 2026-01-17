import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';
// Remove circular import - functions are re-exported below to maintain API compatibility
import * as mobileSpotifyService from './mobileSpotifyService';


export const callSpotifyApi = async (endpoint: string, options: RequestInit = {}, retryCount = 0): Promise<Response> => {
    try {
        let accessToken = await mobileSpotifyService.getValidAccessToken();

        if (!accessToken) {
            // Try to refresh the token
            const refreshed = await mobileSpotifyService.refreshAccessToken();
            if (!refreshed) {
                throw new Error('No valid Spotify access token available');
            }
            accessToken = await mobileSpotifyService.getValidAccessToken();
            if (!accessToken) {
                throw new Error('Failed to get access token after refresh');
            }
        }

        const headers = {
            Authorization: `Bearer ${accessToken}`,
            ...options.headers
        };

        const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
            ...options,
            headers
        });

        // If unauthorized and haven't retried yet, try refreshing token
        if (response.status === 401 && retryCount === 0) {
            const refreshed = await mobileSpotifyService.refreshAccessToken();
            if (refreshed) {
                // Retry the call with refreshed token
                return callSpotifyApi(endpoint, options, retryCount + 1);
            }
        }

        return response;
    } catch (error) {
        console.error('Error in Spotify API call:', error);
        // Clear connection state if we have a serious error
        if (error instanceof Error && error.message.includes('No valid Spotify access token')) {
            await AsyncStorage.setItem('spotifyConnected', 'false');
        }
        throw error;
    }
};

/**
 * Get user's top genres from Spotify data
 */
export const getUserGenres = async (): Promise<string[]> => {
    try {
        const accessToken = await AsyncStorage.getItem('spotify_access_token');

        if (!accessToken) {
            console.log('No Spotify access token available');
            return [];
        }

        // Get user's top genres from our API that will proxy to Spotify
        const response = await axiosClient.get('/api/mobile/spotify/genres');
        const genreData = response.data as string[];
        return genreData || [];
    } catch (error) {
        console.error('Failed to fetch user genres:', error);
        return [];
    }
};

/**
 * Get user's recently played tracks from Spotify
 */
export const getRecentlyPlayed = async (limit: number = 5): Promise<any[]> => {
    try {
        const response = await callSpotifyApi(`/me/player/recently-played?limit=${limit}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch recently played tracks: ${response.status}`);
        }

        const data = await response.json();

        // Transform the data
        const tracks = data.items.map((item: any) => ({
            id: item.track.id,
            name: item.track.name,
            artist: item.track.artists.map((artist: any) => artist.name).join(', '),
            albumImage: item.track.album.images[0]?.url || null,
            playedAt: item.played_at
        }));

        return tracks;
    } catch (error) {
        console.error('Error fetching recently played tracks:', error);
        return [];
    }
};

/**
 * Test the Spotify integration
 */
export const testSpotifyIntegration = async () => {
    try {
        const accessToken = await AsyncStorage.getItem('spotify_access_token');
        const refreshToken = await AsyncStorage.getItem('spotify_refresh_token');
        const expiration = await AsyncStorage.getItem('spotify_expiration');

        let expiryStatus = 'No expiration set';
        if (expiration) {
            const expiryTime = parseInt(expiration);
            const now = new Date().getTime();
            const diff = expiryTime - now;

            if (diff > 0) {
                expiryStatus = `Valid for ${Math.floor(diff / 60000)} more minutes`;
            } else {
                expiryStatus = `Expired ${Math.floor(Math.abs(diff) / 60000)} minutes ago`;
            }
        }

        // Test direct API access
        let spotifyApiStatus = 'Not tested';
        if (accessToken) {
            try {
                const response = await fetch('https://api.spotify.com/v1/me', {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });

                if (response.ok) {
                    const profile = await response.json();
                    spotifyApiStatus = `OK - ${profile.display_name || profile.id}`;
                } else {
                    spotifyApiStatus = `Failed - Status ${response.status}`;
                }
            } catch (error) {
                spotifyApiStatus = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }

        // Test our backend endpoint
        let backendStatus = 'Not tested';
        try {
            const response = await axiosClient.get('/api/mobile/spotify/status');
            backendStatus = `OK - ${JSON.stringify(response.data)}`;
        } catch (error) {
            backendStatus = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }

        return {
            accessToken: accessToken ? 'Available' : 'Not available',
            refreshToken: refreshToken ? 'Available' : 'Not available',
            expiration: expiryStatus,
            spotifyApiStatus,
            backendStatus
        };
    } catch (error) {
        console.error('Spotify integration test failed:', error);
        return {
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

// Dynamic imports to avoid circular dependency
export const getTopArtists = async (limit?: number) => {
    const module = await import('./spotifyDiscoveryService');
    return module.getTopArtists(limit);
};

export const getUserPlaylists = async (limit?: number) => {
    const module = await import('./spotifyDiscoveryService');
    return module.getUserPlaylists(limit);
};

export const getPlaylistTracks = async (playlistId: string, limit?: number) => {
    const module = await import('./spotifyDiscoveryService');
    return module.getPlaylistTracks(playlistId, limit);
};

export const getArtistsByIds = async (artistIds: string[]) => {
    const module = await import('./spotifyDiscoveryService');
    return module.getArtistsByIds(artistIds);
};

export const processGenresFromSelection = async (selectedIds: string[]) => {
    const module = await import('./spotifyDiscoveryService');
    return module.processGenresFromSelection(selectedIds);
};

export const getVenueRecommendations = async (venueType?: 'bar' | 'club') => {
    const module = await import('./spotifyDiscoveryService');
    return module.getVenueRecommendations(venueType);
};

// Export all functions
export default {
    getUserGenres,
    getRecentlyPlayed,
    testSpotifyIntegration,
    getTopArtists,
    getUserPlaylists,
    getPlaylistTracks,
    getArtistsByIds,
    processGenresFromSelection,
    getVenueRecommendations
};
