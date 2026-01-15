// api/mobile/bars/matching/+server.ts
// Find bars matching user's genre preferences
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import genreClusters from '$lib/data/genreClusters.json';
import { normalizeCityName } from '$lib/spotifyUtils';

// Helper functions for genre matching
const normalizeGenre = (genre: string): string => {
	return genre
		.toLowerCase()
		.trim()
		.replace(/\s*\/\s*/g, ' ') // Replace slashes with spaces
		.replace(/[&']/g, '') // Remove & and '
		.replace(/\s+/g, ' '); // Normalize spaces
};

const shouldIgnoreGenre = (genre: string): boolean => {
	const ignoredGenres = ['none', 'soft porn', 'vaa', 'idiotic', 'new', 'the'];
	return ignoredGenres.some((ignored) => genre.toLowerCase().includes(ignored.toLowerCase()));
};

// Function to get top genres from rolling profile
function getTopGenres(profile: { [key: string]: number }): string[] {
	// Convert profile to array of [genre, weight] pairs
	const genrePairs = Object.entries(profile);

	// Sort by weight (descending) and take top 5
	return genrePairs
		.sort(([, a], [, b]) => b - a) // Sort by weight
		.slice(0, 5) // Take top 5
		.map(([genre]) => genre); // Extract just the genre names
}

// Function to handle compound genres like "deep/tech house"
function expandCompoundGenres(genres: string[]): string[] {
	const expandedGenres: string[] = [];

	for (const genre of genres) {
		// Add the original genre
		expandedGenres.push(genre);

		// Handle compound genres with slashes or multiple words
		const parts = genre.split(/[/\s]+/).map((part) => part.trim());

		// Only split compound genres if they don't form a known combination
		const knownCombinations = [
			'afro house',
			'tech house',
			'deep house',
			'latin house',
			'melodic house',
			'future house',
			'melodic techno',
			'progressive house',
			'tribal house',
			'organic house'
		];

		if (parts.length > 1 && !knownCombinations.includes(genre.toLowerCase())) {
			parts.forEach((part) => {
				if (!shouldIgnoreGenre(part) && part.length > 2) {
					expandedGenres.push(part);
				}
			});
		}
	}

	return [...new Set(expandedGenres)].filter((genre) => !shouldIgnoreGenre(genre));
}

// Function to combine genres from events with bar profile
function combineGenreProfiles(
	barProfile: { [key: string]: number } | null,
	eventGenres: string[]
): { [key: string]: number } {
	// Start with the bar's profile or an empty object if null
	const combinedProfile: { [key: string]: number } = { ...(barProfile || {}) };

	// Add event genres with a weight of 0.5 (half the importance of the bar's regular genres)
	eventGenres.forEach((genre) => {
		const normalizedGenre = normalizeGenre(genre);
		if (!shouldIgnoreGenre(normalizedGenre) && normalizedGenre.length > 2) {
			combinedProfile[normalizedGenre] = (combinedProfile[normalizedGenre] || 0) + 0.5;
		}
	});

	return combinedProfile;
}

interface ClusterResult {
	genre: string;
	cluster: string;
	subCluster: string;
}

const findGenreClusters = (genres: string[] | { [key: string]: number }): ClusterResult[] => {
	const clusters: ClusterResult[] = [];
	const missingGenres = new Set<string>();

	// Normalize input to an array of genres
	const genreList = Array.isArray(genres) ? genres : Object.keys(genres);

	// Helper function to match a genre in subclusters
	interface SubCluster {
		name: string;
		genres?: string[];
		sub_clusters?: SubCluster[];
	}

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
			const normalizedSubGenres = subCluster.genres?.map((g: string) => normalizeGenre(g));

			if (
				normalizedSubGenres?.some(
					(g: string) =>
						g === normalizedInputGenre ||
						(g.includes('house') && normalizedInputGenre.includes('house')) ||
						(g.includes('techno') && normalizedInputGenre.includes('techno'))
				)
			) {
				clusters.push({
					genre,
					cluster: clusterName,
					subCluster: subCluster.name
				});
				return true;
			}

			// Recursively search in nested sub_clusters
			if (subCluster.sub_clusters) {
				const foundInNested = matchGenreInSubClusters(subCluster.sub_clusters, genre, clusterName);
				if (foundInNested) return true;
			}
		}
		return false;
	};

	// Process each genre
	for (const genre of genreList) {
		const normalizedGenre = genre.toLowerCase().trim();

		// Skip empty genres or very short strings
		if (!normalizedGenre || normalizedGenre.length < 2) {
			continue;
		}

		// Skip ignored genres without logging
		if (shouldIgnoreGenre(normalizedGenre)) {
			continue;
		}

		let found = false;

		for (const cluster of genreClusters.clusters) {
			if (matchGenreInSubClusters(cluster.sub_clusters, normalizedGenre, cluster.name)) {
				found = true;
				break;
			}
		}

		if (!found && !missingGenres.has(normalizedGenre)) {
			console.warn(`Genre ${normalizedGenre} not found in any cluster`);
			missingGenres.add(normalizedGenre);
		}
	}

	return clusters;
};

const calculateClusterSimilarity = (
	userClusters: ClusterResult[],
	venueClusters: ClusterResult[]
): { similarity: number; matchingGenres: string[] } => {
	const userClusterNames = userClusters.map((c) => c.cluster + c.subCluster);
	const venueClusterNames = venueClusters.map((c) => c.cluster + c.subCluster);

	const intersection = userClusterNames.filter((value) => venueClusterNames.includes(value));
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

/**
 * Find bars matching user's genre preferences
 * Endpoint: POST /api/mobile/bars/matching
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { city, date: requestedDate, genres } = await request.json();

		if (!city) {
			return json(
				{
					success: false,
					message: 'City parameter is required'
				},
				{ status: 400 }
			);
		}

		if (!genres || !Array.isArray(genres) || genres.length === 0) {
			return json(
				{
					success: false,
					message: 'Valid genres array is required'
				},
				{ status: 400 }
			);
		}

		const normalizedCity = normalizeCityName(city);
		const today = new Date().toISOString().split('T')[0];
		const date = requestedDate || today;

		console.log(
			`Finding matching bars in ${normalizedCity} for date ${date} with ${genres.length} genres`
		);

		// Get all bars for the specified city with their most recent genre profiles
		const barsQuery = `
      WITH LatestProfiles AS (
        SELECT 
          bar_id,
          current_track_name,
          current_track_id,
          current_genres,
          rolling_genre_profile,
          timestamp,
          ROW_NUMBER() OVER (PARTITION BY bar_id ORDER BY timestamp DESC) as rn
        FROM 
          clubfindr.bar_genre_profiles
      )
      SELECT 
        b.id, 
        b.name, 
        b.address, 
        b.postcode,
        b.city,
        b.website,
        b.description,
        p.current_track_name as current_track,
        p.current_track_id as current_track_id,
        p.current_genres,
        p.rolling_genre_profile,
        (
          SELECT json_agg(json_build_object('name', a.artist_name, 'id', a.id))
          FROM clubfindr.artists a
          WHERE a.primary_city = b.city
          LIMIT 5
        ) as artists
      FROM clubfindr.bars b
      LEFT JOIN LatestProfiles p ON b.id = p.bar_id AND p.rn = 1
      WHERE b.city = $1
      ORDER BY b.name ASC;
    `;

		const barsResult = await pool.query(barsQuery, [normalizedCity]);

		// Create a map of bars for easier access
		const barsMap = new Map();
		barsResult.rows.forEach((bar) => {
			barsMap.set(bar.id, {
				...bar,
				events: [],
				rolling_genre_profile: bar.rolling_genre_profile || {}
			});
		});

		console.log(`Found ${barsResult.rows.length} total bars in ${normalizedCity}`);

		// Get events for the requested date
		const eventsQuery = `
				SELECT 
					id,
					bar_id,
					theme_name,
					description,
					event_date,
					start_time,
					end_time,
					recurring,
					recurrence_pattern,
					COALESCE(special_genres, ARRAY[]::text[]) as special_genres
				FROM 
					clubfindr.bar_events 
				WHERE 
					bar_id = ANY($1) 
					AND event_date = $2
				ORDER BY 
					start_time ASC
			`;

		const barIds = Array.from(barsMap.keys());
		const eventsResult = await pool.query(eventsQuery, [barIds, date]);

		// Process events and their genres if any exist for the requested date
		if (eventsResult.rows.length > 0) {
			console.log(`Found ${eventsResult.rows.length} events for ${date}`);
			eventsResult.rows.forEach(
				(event: {
					id: string;
					bar_id: string;
					theme_name: string;
					description: string;
					event_date: string;
					start_time: string;
					end_time: string;
					recurring: boolean;
					recurrence_pattern: string | null;
					special_genres: string[];
				}) => {
					if (barsMap.has(event.bar_id)) {
						const bar = barsMap.get(event.bar_id);

						// Add event to the bar
						bar.events.push(event);

						// Combine event genres with bar profile if event has special genres
						if (event.special_genres && event.special_genres.length > 0) {
							bar.rolling_genre_profile = combineGenreProfiles(
								bar.rolling_genre_profile,
								event.special_genres
							);
						}
					}
				}
			);
		}

		const bars = Array.from(barsMap.values());

		if (bars.length === 0) {
			console.log(`No bars found in ${normalizedCity} for date ${date}`);
			return json([]);
		}

		console.log(`Found ${bars.length} bars, now calculating genre matches`);

		// Expand user genres for better matching
		const expandedGenres = expandCompoundGenres(genres);
		console.log('Expanded user genres:', expandedGenres);

		// Find genre clusters for expanded user genres
		const userClusters = findGenreClusters(expandedGenres);

		if (userClusters.length === 0) {
			console.log('No clusters found for user genres, returning all bars without matching');
			return json(bars);
		}

		// Calculate similarity for each bar
		const matchingBars = bars.map((bar) => {
			// Process bar genres including event genres
			const venueClusters = findGenreClusters(bar.rolling_genre_profile || {});

			// Log genre matching details
			console.log(`Bar ${bar.name}:`);
			console.log(` - Genre profile:`, bar.rolling_genre_profile || {});
			console.log(` - Found ${venueClusters.length} venue clusters`);

			// Calculate similarity
			const { similarity, matchingGenres } = calculateClusterSimilarity(
				userClusters,
				venueClusters
			);
			console.log(` - Similarity: ${similarity}, Matching genres: ${matchingGenres.join(', ')}`);

			// Format current track information
			let currentTrack = null;
			if (bar.current_track) {
				// Try to extract artist from the track name
				let artist = '';
				const trackParts = bar.current_track.split(' - ');
				if (trackParts.length > 1) {
					artist = trackParts[0];
					currentTrack = {
						name: trackParts[1],
						artist: artist
					};
				} else {
					currentTrack = {
						name: bar.current_track,
						artist: 'Unknown Artist'
					};
				}
			}

			// Format events for response
			const formattedEvents = bar.events.map(
				(event: {
					id: string;
					theme_name: string;
					description: string;
					event_date: string;
					start_time: string;
					end_time: string;
					special_genres: string[];
				}) => ({
					id: event.id,
					name: event.theme_name,
					description: event.description,
					date: new Date(event.event_date).toISOString().split('T')[0], // Ensure consistent YYYY-MM-DD format
					startTime: event.start_time,
					endTime: event.end_time,
					genres: event.special_genres || []
				})
			);

			// Get top genres from rolling profile
			const topGenres = getTopGenres(bar.rolling_genre_profile || {});

			// Return the bar with similarity score, matching genres, events, and top genres
			return {
				...bar,
				similarity: similarity,
				matchingGenres: matchingGenres,
				currentTrack: currentTrack,
				venueType: 'bar',
				events: formattedEvents,
				topGenres: topGenres
			};
		});

		// Return all bars, sorted by similarity
		const filteredBars = matchingBars.sort((a, b) => b.similarity - a.similarity);

		console.log(
			`Returning all ${filteredBars.length} bars, sorted by similarity (removed similarity threshold)`
		);

		console.log(`Returning ${filteredBars.length} matching bars`);
		console.log('json information:', filteredBars);
		return json(filteredBars);
	} catch (error) {
		console.error('Error finding matching bars:', error);
		return json(
			{
				success: false,
				message: 'Failed to find matching bars',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
