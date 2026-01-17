import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';
import { Venue } from './discoveryService';
import { callSpotifyApi } from './spotifyService';

// Define types for better TypeScript support
interface Artist {
    id: string;
    name: string;
    genres: string[];
    images: { url: string; width?: number; height?: number }[];
    popularity: number;
    spotifyUrl?: string;
    external_urls?: { spotify: string };
}

interface Track {
    id: string;
    name: string;
    artist: string;
    albumImage: string | null;
    playedAt: string;
}

interface Playlist {
    id: string;
    name: string;
    images: { url: string; width?: number; height?: number }[];
    tracks: {
        total: number;
        href: string;
    };
    owner: string;
    public: boolean;
    spotifyUrl: string;
    external_urls?: { spotify: string };
}

interface PlaylistTrack {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album: {
        id: string;
        name: string;
        images: { url: string; width?: number; height?: number }[];
    };
    popularity: number;
    spotifyUrl: string;
}

interface GenresResponse {
    success: boolean;
    genresList: string[];
    message?: string;
}

// Function to get user's top artists from Spotify
export const getTopArtists = async (limit: number = 20): Promise<Artist[]> => {
    try {
        const response = await callSpotifyApi(`/me/top/artists?limit=${limit}`);

        if (!response.ok) {
            console.error('Failed to fetch top artists:', response.status);
            return getMockArtists();
        }

        const data = await response.json();

        // Check if the data has the expected structure
        if (!data || !data.items || !Array.isArray(data.items)) {
            console.error('Invalid artist data structure');
            return getMockArtists();
        }

        // Transform the data
        const artists: Artist[] = data.items.map((artist: any) => ({
            id: artist.id || `mock-${Math.random()}`,
            name: artist.name || 'Unknown Artist',
            genres: artist.genres || ['electronic', 'house'],
            images: artist.images || [],
            popularity: artist.popularity || 50,
            spotifyUrl: artist.external_urls?.spotify || ''
        }));

        console.log(`Processed ${artists.length} top artists`);
        return artists;
    } catch (error) {
        console.error('Error fetching top artists:', error);
        return getMockArtists();
    }
};

// Function to get user's playlists from Spotify
export const getUserPlaylists = async (limit: number = 20): Promise<Playlist[]> => {
    try {
        const response = await callSpotifyApi(`/me/playlists?limit=${limit}`);

        if (!response.ok) {
            console.error('Failed to fetch playlists:', response.status);
            // Return mock data if the API fails
            return getMockPlaylists();
        }

        const data = await response.json();
        console.log('Raw playlists response:', {
            total: data.total,
            itemsLength: data.items?.length,
            firstItem: data.items?.[0],
            status: response.status
        });

        // Check if the data has the expected structure
        if (!data || !data.items || !Array.isArray(data.items)) {
            console.error('Invalid playlist data structure:', JSON.stringify(data).substring(0, 200));
            return getMockPlaylists();
        }

        // Transform the data
        const playlists: Playlist[] = data.items.map((playlist: any) => ({
            id: playlist.id || `mock-${Math.random()}`,
            name: playlist.name || 'Unnamed Playlist',
            images: playlist.images || [],
            tracks: {
                total: playlist.tracks?.total || 0,
                href: playlist.tracks?.href || ''
            },
            owner: playlist.owner?.display_name || 'Unknown',
            public: playlist.public !== undefined ? playlist.public : false,
            spotifyUrl: playlist.external_urls?.spotify || ''
        }));

        console.log(`Processed ${playlists.length} playlists`);
        return playlists;
    } catch (error) {
        console.error('Error fetching playlists:', error);
        // Return mock data on error
        return getMockPlaylists();
    }
};

// Function to get recently played tracks
export const getRecentlyPlayed = async (limit: number = 20): Promise<Track[]> => {
    try {
        const response = await callSpotifyApi(`/me/player/recently-played?limit=${limit}`);

        if (!response.ok) {
            console.error('Failed to fetch recently played tracks:', response.status);
            return getMockTracks();
        }

        const data = await response.json();

        // Check if the data has the expected structure
        if (!data || !data.items || !Array.isArray(data.items)) {
            console.error('Invalid tracks data structure');
            return getMockTracks();
        }

        // Transform the data - with additional error handling
        const tracks: Track[] = data.items.map((item: any) => {
            try {
                return {
                    id: item.track?.id || `mock-${Math.random()}`,
                    name: item.track?.name || 'Unknown Track',
                    artist: item.track?.artists?.map((artist: any) => artist.name).join(', ') || 'Unknown Artist',
                    albumImage: item.track?.album?.images?.[0]?.url || null,
                    playedAt: item.played_at || new Date().toISOString()
                };
            } catch (e) {
                console.error('Error processing track item:', e);
                return {
                    id: `error-${Math.random()}`,
                    name: 'Error Processing Track',
                    artist: 'Unknown',
                    albumImage: null,
                    playedAt: new Date().toISOString()
                };
            }
        });

        console.log(`Processed ${tracks.length} recently played tracks`);
        return tracks;
    } catch (error) {
        console.error('Error fetching recently played tracks:', error);
        return getMockTracks();
    }
};

// Function to get playlist tracks
export const getPlaylistTracks = async (playlistId: string, limit: number = 50): Promise<PlaylistTrack[]> => {
    try {
        const response = await callSpotifyApi(`/playlists/${playlistId}/tracks?limit=${limit}`);

        if (!response.ok) {
            console.error('Failed to fetch playlist tracks:', response.status);
            return [];
        }

        const data = await response.json();

        // Check if the data has the expected structure
        if (!data || !data.items || !Array.isArray(data.items)) {
            console.error('Invalid playlist tracks data structure');
            return [];
        }

        // Transform the data - with additional error handling
        const tracks: PlaylistTrack[] = data.items
            .filter((item: any) => item.track) // Filter out null tracks
            .map((item: any) => {
                try {
                    const track = item.track;
                    return {
                        id: track.id || `mock-${Math.random()}`,
                        name: track.name || 'Unknown Track',
                        artists: track.artists?.map((artist: any) => ({
                            id: artist.id || '',
                            name: artist.name || 'Unknown Artist'
                        })) || [],
                        album: {
                            id: track.album?.id || '',
                            name: track.album?.name || '',
                            images: track.album?.images || []
                        },
                        popularity: track.popularity || 0,
                        spotifyUrl: track.external_urls?.spotify || ''
                    };
                } catch (e) {
                    console.error('Error processing playlist track:', e);
                    return {
                        id: `error-${Math.random()}`,
                        name: 'Error Processing Track',
                        artists: [{ id: '', name: 'Unknown' }],
                        album: { id: '', name: '', images: [] },
                        popularity: 0,
                        spotifyUrl: ''
                    };
                }
            });

        console.log(`Processed ${tracks.length} tracks from playlist ${playlistId}`);
        return tracks;
    } catch (error) {
        console.error('Error fetching playlist tracks:', error);
        return [];
    }
};

// Function to get artists by IDs
export const getArtistsByIds = async (artistIds: string[]): Promise<Artist[]> => {
    try {
        // If no IDs provided, return mock data
        if (!artistIds || artistIds.length === 0) {
            console.log('No artist IDs provided, using mock data');
            return getMockArtists();
        }

        // Spotify API allows a maximum of 50 IDs per request
        const maxIdsPerRequest = 50;
        const uniqueIds = [...new Set(artistIds)].filter(id => id && id.length > 0); // Remove duplicates and empty IDs

        // If no valid IDs remain after filtering, return mock data
        if (uniqueIds.length === 0) {
            console.log('No valid artist IDs after filtering, using mock data');
            return getMockArtists();
        }

        // Split the IDs into chunks of 50
        const chunks = [];
        for (let i = 0; i < uniqueIds.length; i += maxIdsPerRequest) {
            chunks.push(uniqueIds.slice(i, i + maxIdsPerRequest));
        }

        console.log(`Split into ${chunks.length} chunks for API requests`);

        // Make a request for each chunk and combine the results
        const results = await Promise.all(
            chunks.map(async (chunk, index) => {
                try {
                    const idsString = chunk.join(',');
                    console.log(`Fetching chunk ${index + 1}/${chunks.length} with ${chunk.length} IDs`);

                    const response = await callSpotifyApi(`/artists?ids=${idsString}`);

                    if (!response.ok) {
                        console.error(`Failed to fetch artists chunk ${index + 1}:`, response.status);
                        return [];
                    }

                    const data = await response.json();
                    return data.artists || [];
                } catch (chunkError) {
                    console.error(`Error fetching chunk ${index + 1}:`, chunkError);
                    return [];
                }
            })
        );

        // Flatten the results
        const allArtists = results.flat();
        console.log(`Retrieved ${allArtists.length} artists in total`);

        if (allArtists.length === 0) {
            console.log('No artists returned from API, using mock data');
            return getMockArtists();
        }

        return allArtists;
    } catch (error) {
        console.error('Error fetching artists by IDs:', error);
        return getMockArtists();
    }
};

// Function to process genres from selected Spotify IDs
export const processGenresFromSelection = async (selectedIds: string[]): Promise<GenresResponse> => {
    try {
        // First, check if we have any selectedIds
        if (!selectedIds || selectedIds.length === 0) {
            return {
                success: false,
                genresList: [],
                message: 'No Spotify IDs provided'
            };
        }

        console.log("Processing Spotify IDs:", selectedIds);

        // Get artists information for all selected IDs
        const artists = await getArtistsByIds(selectedIds);

        // Create a fallback list of common genres in case no genres are found
        const fallbackGenres = ["electronic", "house", "techno", "pop", "hip hop"];

        // Extract and deduplicate genres
        const genresSet = new Set<string>();

        // Add safety check - if no artists found or artists is empty, use fallback
        if (!artists || artists.length === 0) {
            console.log("No artist information found, using fallback genres");
            fallbackGenres.forEach(genre => genresSet.add(genre));
        } else {
            // Process each artist's genres
            artists.forEach((artist: Artist) => {
                // Add null check for artist
                if (artist && artist.genres && Array.isArray(artist.genres)) {
                    artist.genres.forEach((genre: string) => {
                        genresSet.add(genre.toLowerCase().trim());
                    });
                }
            });

            // If no genres were found from artists, use fallback
            if (genresSet.size === 0) {
                console.log("No genres found in artist data, using fallback genres");
                fallbackGenres.forEach(genre => genresSet.add(genre));
            }
        }

        const genresList = Array.from(genresSet);
        console.log("Extracted genres:", genresList);

        // Send the genres to our backend to process matching venues
        try {
            // First try to use our backend API
            const response = await axiosClient.post('/api/mobile/spotify/genres/process', {
                genres: genresList
            });
            const result = response.data;

            // If successful, store the genres in AsyncStorage
            await AsyncStorage.setItem('spotify-genres', genresList.join(','));

            return {
                success: true,
                genresList,
                message: 'Genres processed successfully with backend API'
            };
        } catch (backendError) {
            console.warn('Failed to process genres with backend, using local fallback', backendError);

            // If backend fails, we'll still return the genre list for client-side use
            await AsyncStorage.setItem('spotify-genres', genresList.join(','));

            return {
                success: true,
                genresList,
                message: 'Genres extracted locally'
            };
        }
    } catch (error) {
        console.error('Error processing genres from selection:', error);
        return {
            success: false,
            genresList: [],
            message: error instanceof Error ? error.message : 'Unknown error processing genres'
        };
    }
};

// Function to get venue recommendations based on user genres
export const getVenueRecommendations = async (
    venueType: 'bar' | 'club' = 'bar'
): Promise<Venue[]> => {
    try {
        // Get the stored genres
        const genres = await AsyncStorage.getItem('spotify-genres');

        if (!genres) {
            console.log('No genres found for venue recommendations');
            return [];
        }

        // Get city from storage or use default
        const city = await AsyncStorage.getItem('userCity') || 'berlin';

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Request venue recommendations from the server
        try {
            const endpoint = venueType === 'bar'
                ? '/api/mobile/bars/matching'
                : '/api/mobile/events/matching';

            const response = await axiosClient.post(endpoint, {
                city,
                date: today,
                genres: genres.split(',')
            });
            const venues = response.data;

            if (venues && Array.isArray(venues)) {
                return venues;
            }
            return [];
        } catch (error) {
            console.error(`Failed to fetch matching ${venueType}s:`, error);
            return [];
        }
    } catch (error) {
        console.error('Error getting venue recommendations:', error);
        return [];
    }
};

// Mock artists data as fallback
const getMockArtists = (): Artist[] => {
    console.log('Using mock artist data');
    return [
        {
            id: 'mock-artist-1',
            name: 'Daft Punk',
            genres: ['electronic', 'french house', 'new rave'],
            images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb2183ea12ac6e9b89a70c7804' }],
            popularity: 80,
            spotifyUrl: ''
        },
        {
            id: 'mock-artist-2',
            name: 'Justice',
            genres: ['electronic', 'electronic rock', 'new rave'],
            images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb6fdbe4bba5da0fd2f98b83d6' }],
            popularity: 75,
            spotifyUrl: ''
        },
        {
            id: 'mock-artist-3',
            name: 'The Chemical Brothers',
            genres: ['electronic', 'big beat', 'electronica'],
            images: [{ url: 'https://i.scdn.co/image/ab6761610000e5eb79ef2da8c3e731c28f2525c6' }],
            popularity: 72,
            spotifyUrl: ''
        }
    ];
};

// Mock tracks data as fallback
const getMockTracks = (): Track[] => {
    console.log('Using mock tracks data');
    return [
        {
            id: 'mock-track-1',
            name: 'Around the World',
            artist: 'Daft Punk',
            albumImage: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2',
            playedAt: '2025-03-16T12:00:00Z'
        },
        {
            id: 'mock-track-2',
            name: 'Get Lucky',
            artist: 'Daft Punk, Pharrell Williams',
            albumImage: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2',
            playedAt: '2025-03-16T11:45:00Z'
        },
        {
            id: 'mock-track-3',
            name: 'One More Time',
            artist: 'Daft Punk',
            albumImage: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2',
            playedAt: '2025-03-16T11:30:00Z'
        }
    ];
};

// Mock playlists data as fallback
const getMockPlaylists = (): Playlist[] => {
    console.log('Using mock playlist data');
    return [
        {
            id: 'mock-playlist-1',
            name: 'Dance Hits',
            images: [{ url: 'https://i.scdn.co/image/ab67706c0000da84fcb8b92f2ba312104d427c4b' }],
            tracks: { total: 50, href: '' },
            owner: 'Spotify',
            public: true,
            spotifyUrl: ''
        },
        {
            id: 'mock-playlist-2',
            name: 'Electronic Mix',
            images: [{ url: 'https://i.scdn.co/image/ab67706c0000da84fe1a38371f261b8dae845a79' }],
            tracks: { total: 45, href: '' },
            owner: 'Spotify',
            public: true,
            spotifyUrl: ''
        },
        {
            id: 'mock-playlist-3',
            name: 'House Party',
            images: [{ url: 'https://i.scdn.co/image/ab67706c0000da84d910b8c560d98d68c83d9d13' }],
            tracks: { total: 38, href: '' },
            owner: 'Spotify',
            public: true,
            spotifyUrl: ''
        }
    ];
};

// Extend spotifyService with these discovery functions
export default {
    getTopArtists,
    getUserPlaylists,
    getPlaylistTracks,
    getArtistsByIds,
    processGenresFromSelection,
    getVenueRecommendations
};
