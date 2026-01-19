// bars/+page.server.ts
import { pool } from '$lib/db';
import type { PageServerLoad } from './$types';
import { normalizeCityName } from '$lib/spotifyUtils';
import { cookieManager } from '$lib/cookieManager';
import genreClusters from '$lib/data/genreClusters.json';
import type { EventDetails } from '$lib/types/events';

type BarData = {
	bar_id: string;
	bar_name: string;
	bar_address: string;
	current_track_name: string | null;
	current_track_id: string | null;
	current_genres: string[];
	rolling_genre_profile: { [key: string]: number };
	description: string | null;
	opening_hours: string | null;
	phone: string | null;
	website: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SimilarityResult = BarData & {
	similarity: number;
	matchingGenres: string[];
	events?: EventDetails[];
};

const missingGenresCache = new Set<string>();

function normalizeGenre(genre: string): string {
	return genre
		.toLowerCase()
		.trim()
		.replace(/\s*\/\s*/g, ' ') // Replace slashes with spaces
		.replace(/[&']/g, '') // Remove & and '
		.replace(/\s+/g, ' '); // Normalize spaces
}

function shouldIgnoreGenre(genre: string): boolean {
	const ignoredGenres = ['none', 'soft porn', 'vaa', 'idiotic', 'new', 'the'];
	return ignoredGenres.some((ignored) => genre.toLowerCase().includes(ignored.toLowerCase()));
}

function findClusters(
	genres: string[] | { [key: string]: number }
): { genre: string; cluster: string; subCluster: string }[] {
	const clusters: { genre: string; cluster: string; subCluster: string }[] = [];

	// Normalize input to an array of genres
	const genreList = Array.isArray(genres) ? genres : Object.keys(genres);

	// Extract significant genres
	const significantGenres = genreList
		.map((genre) => genre.toLowerCase().trim())
		.filter((genre) => genre.length >= 2 && !shouldIgnoreGenre(genre));

	// Helper function to match genres in subclusters
	type SubCluster = {
		name: string;
		genres?: string[];
		sub_clusters?: SubCluster[];
	};

	const matchGenreInSubClusters = (
		subClusters: SubCluster[],
		genre: string,
		clusterName: string
	): { genre: string; cluster: string; subCluster: string } | null => {
		const normalizedInputGenre = normalizeGenre(genre);

		// Skip processing for ignored genres
		if (shouldIgnoreGenre(normalizedInputGenre)) {
			return null;
		}

		for (const subCluster of subClusters) {
			const normalizedSubGenres = subCluster.genres?.map((g: string) => normalizeGenre(g)) || [];

			if (
				normalizedSubGenres.some(
					(g: string) =>
						g === normalizedInputGenre ||
						(g.includes('house') && normalizedInputGenre.includes('house')) ||
						(g.includes('techno') && normalizedInputGenre.includes('techno'))
				)
			) {
				return {
					genre,
					cluster: clusterName,
					subCluster: subCluster.name
				};
			}

			// Recursively search in nested sub_clusters
			if (subCluster.sub_clusters) {
				const nestedResult = matchGenreInSubClusters(subCluster.sub_clusters, genre, clusterName);
				if (nestedResult) return nestedResult;
			}
		}
		return null;
	};

	significantGenres.forEach((genre) => {
		let clusterMatch = null;

		genreClusters.clusters.forEach((cluster) => {
			const match = matchGenreInSubClusters(cluster.sub_clusters, genre, cluster.name);
			if (match) {
				clusterMatch = match;
				clusters.push(match);
			}
		});

		if (!clusterMatch && !missingGenresCache.has(genre)) {
			console.warn(`Genre ${genre} not found in any cluster`);
			missingGenresCache.add(genre);
		}
	});

	return clusters;
}

function calculateClusterSimilarity(
	userClusters: { genre: string; cluster: string; subCluster: string }[],
	barClusters: { genre: string; cluster: string; subCluster: string }[]
): { similarity: number; matchingGenres: string[] } {
	// If either cluster list is empty, return no similarity
	if (userClusters.length === 0 || barClusters.length === 0) {
		return { similarity: 0, matchingGenres: [] };
	}

	// Create sets of unique cluster+subcluster combinations
	const userClusterNames = new Set(userClusters.map((c) => `${c.cluster}:${c.subCluster}`));
	const barClusterNames = new Set(barClusters.map((c) => `${c.cluster}:${c.subCluster}`));

	// Find intersection of cluster combinations
	const intersection = [...userClusterNames].filter((value) => barClusterNames.has(value));

	// Compute Jaccard similarity based on cluster combinations
	const union = new Set([...userClusterNames, ...barClusterNames]);

	// Prevent division by zero
	if (union.size === 0) {
		return { similarity: 0, matchingGenres: [] };
	}

	const similarityScore = intersection.length / union.size;

	// Find the exact matching genres based on the clusters
	const matchingGenres = [
		...new Set(
			userClusters
				.filter((uc) =>
					barClusters.some((bc) => uc.cluster === bc.cluster && uc.subCluster === bc.subCluster)
				)
				.map((uc) => uc.genre)
		)
	];

	return {
		similarity: similarityScore,
		matchingGenres
	};
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

export const load: PageServerLoad = async ({ cookies, url, depends }) => {
	depends('app:date');
	const city = normalizeCityName(cookies.get('city') || '');
	const isLoggedIn = cookies.get('isLoggedIn') === 'true';
	let date = cookies.get('date');

	const updatedDate = url.searchParams.get('date');
	const isDateChange = !!updatedDate;
	if (updatedDate) {
		date = updatedDate;
	}

	const address = cookies.get('address');
	let genresList: string[] = [];

	// Ensure required values are present
	if (!city) {
		throw new Error('City not found in cookies');
	}
	if (!date) {
		date = new Date().toISOString().split('T')[0];
		console.log(`No date found in cookies, using today's date: ${date}`);
	}

	const sessionId = cookieManager.get(cookies, 'sessionId');

	// Only process and clear genre cookies if this is not a date change
	if (!isDateChange) {
		// Genre selection logic - prioritize different sources
		// 1. First priority: Explicitly selected genres
		const selectedGenresCookie = cookies.get('selected-genres');
		if (selectedGenresCookie) {
			try {
				genresList = selectedGenresCookie.split(',').map((genre) => genre.trim().toLowerCase());
				genresList = Array.from(new Set(genresList)); // Remove duplicates
				console.log('Using explicitly selected genres from cookie:', genresList);
				cookies.delete('selected-genres', { path: '/' }); // Clean up after reading
			} catch (error) {
				console.error('Error processing selected-genres cookie:', error);
			}
		}

		// 2. Second priority: Legacy genre cookie
		if (genresList.length === 0) {
			const genreCookie = cookies.get('genre');
			if (genreCookie) {
				try {
					genresList = genreCookie.split(',').map((genre) => genre.trim().toLowerCase());
					genresList = Array.from(new Set(genresList)); // Remove duplicates
					console.log('Using genres from legacy genre cookie:', genresList);
					cookies.delete('genre', { path: '/' }); // Clean up after reading
				} catch (error) {
					console.error('Error processing genre cookie:', error);
				}
			}
		}

		// 3. Third priority: Spotify-generated genres
		if (genresList.length === 0) {
			const spotifyGenresCookie = cookies.get('spotify-genres');
			if (spotifyGenresCookie) {
				try {
					genresList = spotifyGenresCookie.split(',').map((genre) => genre.trim().toLowerCase());
					genresList = Array.from(new Set(genresList)); // Remove duplicates
					console.log('Using Spotify-generated genres from cookie:', genresList);
					cookies.delete('spotify-genres', { path: '/' }); // Clean up after reading
				} catch (error) {
					console.error('Error processing spotify-genres cookie:', error);
				}
			}
		}
	} else {
		// If it's a date change, try to get genres from any available source without clearing cookies
		const selectedGenresCookie = cookies.get('selected-genres');
		const genreCookie = cookies.get('genre');
		const spotifyGenresCookie = cookies.get('spotify-genres');

		if (selectedGenresCookie) {
			genresList = selectedGenresCookie.split(',').map((genre) => genre.trim().toLowerCase());
		} else if (genreCookie) {
			genresList = genreCookie.split(',').map((genre) => genre.trim().toLowerCase());
		} else if (spotifyGenresCookie) {
			genresList = spotifyGenresCookie.split(',').map((genre) => genre.trim().toLowerCase());
		}

		genresList = Array.from(new Set(genresList)); // Remove duplicates
	}

	// 4. Fourth priority: For logged-in users, check database session
	if (genresList.length === 0 && sessionId) {
		try {
			const query = `SELECT genres FROM clubfindr.user_sessions 
                    WHERE session_id = $1 AND user_city = $2;`;
			const result = await pool.query(query, [sessionId, city]);

			if (result.rows.length > 0 && result.rows[0].genres) {
				const dbGenres = result.rows[0].genres;

				if (Array.isArray(dbGenres)) {
					genresList = dbGenres.map((genre) =>
						typeof genre === 'string' ? genre.toLowerCase() : genre
					);
				} else if (typeof dbGenres === 'string') {
					genresList = dbGenres.split(',').map((genre) => genre.trim().toLowerCase());
				}

				genresList = Array.from(new Set(genresList)); // Remove duplicates
				console.log('Using genres from database session:', genresList);
			}
		} catch (error) {
			console.error('Error fetching genres from database:', error);
		}
	}

	// If no genres were found from any source, use default genres or show all
	if (genresList.length === 0) {
		console.warn('No genres found from any source. Showing all bars without genre filtering.');
		// You could set default genres here if needed
		// genresList = ['electronic', 'house'];
	}

	// Expand compound genres for better matching
	const expandedGenresList = expandCompoundGenres(genresList);
	console.log('Expanded genres list:', expandedGenresList);

	try {
		// First, get all bars in the city
		const barsQuery = `
      SELECT 
        id AS bar_id,
        name AS bar_name,
        address AS bar_address,
        description,
        opening_hours,
        phone,
        website
      FROM 
        clubfindr.bars
      WHERE 
        city = $1
      ORDER BY 
        name
      LIMIT 50;
    `;

		const barsResult = await pool.query(barsQuery, [city]);

		if (barsResult.rowCount === 0) {
			console.log('No bars found in the database for city:', city);
			return {
				serverSimilarityResults: [],
				date,
				city,
				address,
				isLoggedIn
			};
		}

		// Create a basic map of bars
		const barsMap = new Map();
		barsResult.rows.forEach((bar) => {
			barsMap.set(bar.bar_id, {
				...bar,
				current_track_name: null,
				current_track_id: null,
				current_genres: [],
				rolling_genre_profile: {},
				similarity: 0,
				matchingGenres: [],
				events: []
			});
		});

		// Get bar genre profiles
		const profilesQuery = `
      WITH RankedProfiles AS (
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
        bar_id,
        current_track_name,
        current_track_id,
        current_genres,
        rolling_genre_profile,
        timestamp
      FROM 
        RankedProfiles 
      WHERE 
        rn = 1 AND bar_id = ANY($1)
    `;

		const barIds = Array.from(barsMap.keys());
		const profilesResult = await pool.query(profilesQuery, [barIds]);

		// Merge genre profiles with bars
		profilesResult.rows.forEach((profile) => {
			if (barsMap.has(profile.bar_id)) {
				const bar = barsMap.get(profile.bar_id);
				bar.current_track_name = profile.current_track_name;
				bar.current_track_id = profile.current_track_id;
				bar.current_genres = Array.isArray(profile.current_genres) ? profile.current_genres : [];
				bar.rolling_genre_profile = profile.rolling_genre_profile || {};
			}
		});

		// Get events for these bars
		const selectedDate = date;
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
        AND event_date >= $2
      ORDER BY 
        event_date ASC, start_time ASC
    `;

		const eventsResult = await pool.query(eventsQuery, [barIds, selectedDate]);

		// Process events and their genres
		if (eventsResult.rows.length > 0) {
			// Group events by bar_id
			interface EventRecord {
				bar_id: string;
				special_genres: string[];
				[key: string]: unknown;
			}
			const eventsByBar: Record<string, EventRecord[]> = {};

			eventsResult.rows.forEach((event: EventRecord) => {
				const barId = event.bar_id;
				if (!eventsByBar[barId]) {
					eventsByBar[barId] = [];
				}

				// Ensure event genres is always an array
				event.special_genres = Array.isArray(event.special_genres) ? event.special_genres : [];

				eventsByBar[barId].push(event);
			});

			// Add events to bars and combine genre profiles
			Object.entries(eventsByBar).forEach(([barId, events]) => {
				if (barsMap.has(barId)) {
					const bar = barsMap.get(barId);

					// Add events to the bar
					bar.events = events;

					// Extract all event genres
					const allEventGenres: string[] = [];
					events.forEach((event: EventRecord) => {
						if (event.special_genres && event.special_genres.length > 0) {
							allEventGenres.push(...event.special_genres);
						}
					});

					// Combine event genres with bar profile
					if (allEventGenres.length > 0) {
						bar.rolling_genre_profile = combineGenreProfiles(
							bar.rolling_genre_profile,
							allEventGenres
						);

						// Also add event genres to current_genres for display purposes
						const uniqueGenres = new Set(bar.current_genres);
						allEventGenres.forEach((genre: string) => uniqueGenres.add(genre));
						bar.current_genres = Array.from(uniqueGenres);
					}
				}
			});
		}

		// Find clusters for user genres
		const userClusters = findClusters(expandedGenresList);

		// Calculate similarity for each bar
		const processedBars = Array.from(barsMap.values()).map((bar) => {
			// Get clusters for the bar's combined genres
			const barClusters = findClusters(bar.rolling_genre_profile);

			// Calculate similarity
			const { similarity, matchingGenres } = calculateClusterSimilarity(userClusters, barClusters);

			return {
				...bar,
				similarity,
				matchingGenres
			};
		});

		// Filter out bars with low similarity
		const filteredBars = processedBars
			.filter((bar) => bar.similarity > 0.05)
			.sort((a, b) => b.similarity - a.similarity);

		console.log(`Found ${filteredBars.length} bars matching user genres`);

		return {
			serverSimilarityResults: filteredBars,
			date,
			city,
			address,
			isLoggedIn
		};
	} catch (error) {
		console.error('Error fetching bar data:', (error as Error).message);
		return {
			props: {
				date,
				error: (error as Error).message
			}
		};
	}
};
