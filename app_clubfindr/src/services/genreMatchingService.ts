import axiosClient from '../api/axiosClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Venue } from './discoveryService';

// Types for genre matching
interface GenreCluster {
    name: string;
    sub_clusters: SubCluster[];
}

interface SubCluster {
    name: string;
    genres: string[];
    sub_clusters?: SubCluster[];
}

interface ClusterResult {
    genre: string;
    cluster: string;
    subCluster: string;
}

// Helper function to normalize genre strings for comparison
const normalizeGenre = (genre: string): string => {
    return genre
        .toLowerCase()
        .trim()
        .replace(/\s*\/\s*/g, ' ') // Replace slashes with spaces
        .replace(/[&']/g, '') // Remove & and '
        .replace(/\s+/g, ' '); // Normalize spaces
};

// Helper function to check if a genre should be ignored
const shouldIgnoreGenre = (genre: string): boolean => {
    const ignoredGenres = [
        'none',
        'soft porn',
        'vaa',
        'idiotic'
        // Add other terms you want to ignore
    ];

    return ignoredGenres.some((ignored) =>
        genre.toLowerCase().includes(ignored.toLowerCase()));
};

// Function to find genre clusters (simplified version of your SvelteKit implementation)
export const findGenreClusters = (
    genres: string[],
    genreClusters: { clusters: GenreCluster[] }
): ClusterResult[] => {
    const clusters: ClusterResult[] = [];
    const missingGenres: Set<string> = new Set();

    // Helper function to match a genre in subclusters
    const matchGenreInSubClusters = (
        subClusters: SubCluster[],
        genre: string,
        clusterName: string
    ): boolean => {
        const normalizedInputGenre = normalizeGenre(genre);

        // Skip processing for ignored genres
        if (shouldIgnoreGenre(normalizedInputGenre)) {
            return true;
        }

        for (const subCluster of subClusters) {
            const normalizedSubGenres = subCluster.genres?.map((g) => normalizeGenre(g));

            if (normalizedSubGenres?.some((g) =>
                g === normalizedInputGenre ||
                g.includes(normalizedInputGenre) ||
                normalizedInputGenre.includes(g))) {

                clusters.push({
                    genre,
                    cluster: clusterName,
                    subCluster: subCluster.name
                });
                return true;
            }

            // Recursively search in nested sub_clusters
            if (subCluster.sub_clusters) {
                const foundInNested = matchGenreInSubClusters(
                    subCluster.sub_clusters,
                    genre,
                    clusterName
                );
                if (foundInNested) return true;
            }
        }
        return false;
    };

    genres.forEach((genre) => {
        const normalizedGenre = genre.toLowerCase().trim();

        // Skip empty genres or very short strings
        if (!normalizedGenre || normalizedGenre.length < 2) {
            return;
        }

        // Skip ignored genres without logging
        if (shouldIgnoreGenre(normalizedGenre)) {
            return;
        }

        let found = false;

        genreClusters.clusters.forEach((cluster) => {
            if (matchGenreInSubClusters(cluster.sub_clusters, normalizedGenre, cluster.name)) {
                found = true;
            }
        });

        if (!found && !missingGenres.has(normalizedGenre)) {
            console.warn(`Genre ${normalizedGenre} not found in any cluster`);
            missingGenres.add(normalizedGenre);
        }
    });

    return clusters;
};

// Function to calculate similarity between user and venue genre clusters
export const calculateClusterSimilarity = (
    userClusters: ClusterResult[],
    venueClusters: ClusterResult[]
): { similarity: number; matchingGenres: string[] } => {
    const userClusterNames = userClusters.map((c) => c.cluster + c.subCluster);
    const venueClusterNames = venueClusters.map((c) => c.cluster + c.subCluster);

    const intersection = userClusterNames.filter((value) =>
        venueClusterNames.includes(value));
    const union = new Set([...userClusterNames, ...venueClusterNames]);

    // Prevent division by zero
    if (union.size === 0) {
        return { similarity: 0, matchingGenres: [] };
    }

    const similarityScore = intersection.length / union.size;

    // Find the matching genres based on the clusters
    const matchingGenres = userClusters
        .filter((uc) =>
            venueClusters.some((cc) => uc.cluster + uc.subCluster === cc.cluster + cc.subCluster)
        )
        .map((uc) => uc.genre);

    return { similarity: similarityScore, matchingGenres };
};

// Function to get genre clusters data from server or local cache
export const getGenreClusters = async (): Promise<{ clusters: GenreCluster[] }> => {
    try {
        // Try to get from local cache first
        const cachedData = await AsyncStorage.getItem('genre_clusters');
        if (cachedData) {
            return JSON.parse(cachedData);
        }

        // If not in cache, fetch from server
        const response = await axiosClient.get('/api/mobile/genre-clusters');
        const data = response.data as { clusters: GenreCluster[] };

        // Cache the result
        await AsyncStorage.setItem('genre_clusters', JSON.stringify(data));

        return data;
    } catch (error) {
        console.error('Failed to get genre clusters:', error);

        // Return a minimal structure if all else fails
        return {
            clusters: [
                {
                    name: 'Electronic',
                    sub_clusters: [
                        {
                            name: 'House',
                            genres: ['house', 'deep house', 'tech house', 'progressive house']
                        },
                        {
                            name: 'Techno',
                            genres: ['techno', 'minimal techno', 'industrial techno']
                        }
                    ]
                },
                {
                    name: 'Hip Hop',
                    sub_clusters: [
                        {
                            name: 'Rap',
                            genres: ['hip hop', 'rap', 'trap', 'drill']
                        }
                    ]
                }
            ]
        };
    }
};

// Main function to find matching venues based on user genres
export const findMatchingVenues = async (
    userGenres: string[],
    venues: Venue[],
    venueType: 'bar' | 'club' = 'bar'
): Promise<Venue[]> => {
    try {
        // Get genre clusters data
        const genreClusters = await getGenreClusters();

        // Find clusters for user genres
        const userClusters = findGenreClusters(userGenres, genreClusters);

        if (userClusters.length === 0) {
            console.warn('No matching clusters found for user genres');
            return venues; // Return all venues if no user clusters found
        }

        // Calculate similarity for each venue
        const venuesWithSimilarity = venues.map((venue) => {
            // Find clusters for venue genres
            const venueClusters = findGenreClusters(venue.genres, genreClusters);

            // Calculate similarity between user and venue clusters
            const { similarity, matchingGenres } = calculateClusterSimilarity(
                userClusters,
                venueClusters
            );

            return {
                ...venue,
                similarity,
                matchingGenres
            };
        });

        // Filter venues with some similarity
        const matchingVenues = venuesWithSimilarity
            .filter((venue) => venue.similarity > 0.1)
            .sort((a, b) => b.similarity - a.similarity);

        return matchingVenues;
    } catch (error) {
        console.error('Error finding matching venues:', error);
        return venues; // Return original venues on error
    }
};

// Function to process user genres and find venues
export const processUserGenresAndFindVenues = async (
    userGenres: string[],
    venueType: 'bar' | 'club' = 'bar'
): Promise<Venue[]> => {
    try {
        // Get city from storage or use default
        const city = await AsyncStorage.getItem('userCity') || 'berlin';

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Store the genres in AsyncStorage
        await AsyncStorage.setItem('selected-genres', userGenres.join(','));

        // Try to use our backend API first
        try {
            const endpoint = venueType === 'bar'
                ? '/api/mobile/bars/matching'
                : '/api/mobile/events/matching';

            const response = await axiosClient.post(endpoint, {
                city,
                date: today,
                genres: userGenres
            });
            const matchingVenues = response.data;

            if (matchingVenues && Array.isArray(matchingVenues) && matchingVenues.length > 0) {
                return matchingVenues as Venue[];
            }

            throw new Error('No matching venues returned from API');
        } catch (apiError) {
            console.warn('API matching failed, using local matching logic', apiError);

            // Fallback to local matching if API call fails
            // First get all venues for the city and date
            const endpoint = venueType === 'bar'
                ? '/api/mobile/bars'
                : '/api/mobile/events';

            const response = await axiosClient.post(endpoint, {
                city,
                date: today
            });
            const allVenues = response.data;

            if (!allVenues || !Array.isArray(allVenues) || allVenues.length === 0) {
                throw new Error('No venues found');
            }

            // Use local matching logic
            return findMatchingVenues(userGenres, allVenues as Venue[], venueType);
        }
    } catch (error) {
        console.error('Error processing user genres:', error);
        throw error;
    }
};

export default {
    findGenreClusters,
    calculateClusterSimilarity,
    getGenreClusters,
    findMatchingVenues,
    processUserGenresAndFindVenues
};
