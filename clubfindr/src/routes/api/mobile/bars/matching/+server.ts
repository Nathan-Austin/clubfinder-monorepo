// api/mobile/bars/matching/+server.ts
// Find bars matching user's genre preferences
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import genreClusters from '$lib/data/genreClusters.json';
import { normalizeCityName } from '$lib/spotifyUtils';
import { toLocalIsoDate } from '$lib/localDate';
import { listFavouriteGenresForOwners } from '$lib/taste/favouriteArtists';
import { listDeclaredGenresForOwners, mergeGenresByOwner } from '$lib/taste/venueGenres';
import { getProfileGenreWeightsForRequest } from '$lib/taste/profileGenres';
import {
	calculateClusterSimilarity,
	expandWeightedProfile,
	findClusters,
	findWeightedClusters,
	normalizeGenre,
	scaleProfileToUnit,
	shouldIgnoreGenre
} from '$lib/server/genreMatching';

// Helper functions for genre matching
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
/**
 * Adds genres to a venue's profile.
 *
 * The weight only orders the genres reported for a venue (getTopGenres above); matching scores
 * clusters as sets, so whether a genre is present is what decides a match.
 */
function combineGenreProfiles(
	barProfile: { [key: string]: number } | null,
	extraGenres: string[],
	weight = 0.5
): { [key: string]: number } {
	// Start with the bar's profile or an empty object if null
	const combinedProfile: { [key: string]: number } = { ...(barProfile || {}) };

	extraGenres.forEach((genre) => {
		const normalizedGenre = normalizeGenre(genre);
		if (!shouldIgnoreGenre(normalizedGenre) && normalizedGenre.length > 2) {
			combinedProfile[normalizedGenre] = (combinedProfile[normalizedGenre] || 0) + weight;
		}
	});

	return combinedProfile;
}

/**
 * What is actually on tonight beats any standing description of the venue, so an event's
 * genres carry the full weight of the profile's strongest genre (the rolling profile is scaled
 * to a unit maximum before anything is combined with it).
 */
const EVENT_GENRE_WEIGHT = 1;

/**
 * What a venue says it plays, through the artist picker on its dashboard
 * (clubfindr.bar_favourite_artists). A standing statement: on a day the venue has an event with
 * genres, the line-up speaks for the night and the self-description is a whisper beside it; on
 * a day without one it is the best information there is and counts fully.
 */
const VENUE_ARTIST_GENRE_WEIGHT_WITH_EVENT = 0.25;
const VENUE_ARTIST_GENRE_WEIGHT_WITHOUT_EVENT = 1;

// Function to expand subsubgenre group names to their individual genres
const expandGenreGroups = (genres: string[]): string[] => {
	const expandedGenres: string[] = [];

	interface SubCluster {
		name: string;
		genres?: string[];
		sub_clusters?: SubCluster[];
	}

	// Recursive function to find and expand a group name
	const findAndExpandGroup = (groupName: string, subClusters: SubCluster[]): string[] | null => {
		const normalizedGroupName = normalizeGenre(groupName);

		for (const subCluster of subClusters) {
			const normalizedSubClusterName = normalizeGenre(subCluster.name);

			// If this subCluster name matches the group name, return its genres
			if (normalizedSubClusterName === normalizedGroupName) {
				return subCluster.genres || [];
			}

			// Recursively search in nested sub_clusters
			if (subCluster.sub_clusters) {
				const found = findAndExpandGroup(groupName, subCluster.sub_clusters);
				if (found) return found;
			}
		}

		return null;
	};

	// Process each genre
	for (const genre of genres) {
		let expanded = false;

		// Check if this genre is actually a group name in any cluster
		for (const cluster of genreClusters.clusters as Array<{
			name: string;
			sub_clusters: SubCluster[];
		}>) {
			const groupGenres = findAndExpandGroup(genre, cluster.sub_clusters);
			if (groupGenres && groupGenres.length > 0) {
				// This is a group name - add all its individual genres
				expandedGenres.push(...groupGenres);
				expanded = true;
				console.log(`Expanded genre group "${genre}" to ${groupGenres.length} individual genres`);
				break;
			}
		}

		// If not a group name, keep the genre as-is
		if (!expanded) {
			expandedGenres.push(genre);
		}
	}

	return expandedGenres;
};

/**
 * Find bars matching user's genre preferences
 * Endpoint: POST /api/mobile/bars/matching
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
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

		// Genres the caller picked win; a logged-in caller that sends none is matched on its
		// taste profile instead, the way /clubs and /barfindr already do it (KNOWN_ISSUES 22).
		// The app authenticates with the Bearer token from its login.
		const sentGenres = Array.isArray(genres) ? genres.filter((g) => typeof g === 'string') : [];
		// The profile comes with how many favourite artists carry each genre, so matching can
		// weight a mostly-techno profile as mostly techno (KNOWN_ISSUES 32). Sent genres stay
		// unweighted: naming a genre is asking for it.
		const profileGenreWeights =
			sentGenres.length > 0 ? {} : await getProfileGenreWeightsForRequest(pool, cookies, request);
		const profileGenres = Object.keys(profileGenreWeights).sort();
		const effectiveGenres = sentGenres.length > 0 ? sentGenres : profileGenres;

		if (effectiveGenres.length === 0) {
			return json(
				{
					success: false,
					message: 'Valid genres array is required'
				},
				{ status: 400 }
			);
		}
		if (profileGenres.length > 0) {
			console.log(`Using the caller's taste profile: ${profileGenres.length} genres`);
		}

		const normalizedCity = normalizeCityName(city);
		// The app should send its own calendar date; without one, fall back to the server's local
		// day rather than the UTC one, which is already tomorrow here late in the evening
		// (KNOWN_ISSUES 17)
		const date = requestedDate || toLocalIsoDate();

		// Expand any genre group names to their individual genres
		// e.g., "Reggaeton and Dembow" -> ["Reggaeton", "Dembow", "Trap Latino", ...]
		const expandedGenres = expandGenreGroups(effectiveGenres);

		console.log(
			`Finding matching bars in ${normalizedCity} for date ${date} with ${effectiveGenres.length} genres (expanded to ${expandedGenres.length})`
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
        p.timestamp,
        (
          SELECT json_agg(json_build_object('name', a.artist_name, 'id', a.id))
          FROM clubfindr.artists a
          WHERE a.primary_city = b.city
          LIMIT 5
        ) as artists
      FROM clubfindr.bars b
      LEFT JOIN LatestProfiles p ON b.id = p.bar_id AND p.rn = 1
      WHERE LOWER(b.city) = LOWER($1)
      ORDER BY b.name ASC;
    `;

		const barsResult = await pool.query(barsQuery, [normalizedCity]);

		// Create a map of bars for easier access
		const barsMap = new Map();
		barsResult.rows.forEach((bar) => {
			barsMap.set(bar.id, {
				...bar,
				events: [],
				hasEventGenres: false,
				// Play counts, scaled so the strongest genre weighs 1 and the fixed weights of the
				// other sources below mean something next to them
				rolling_genre_profile: scaleProfileToUnit(bar.rolling_genre_profile || {})
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

						// Combine event genres with bar profile if event has special genres; what is
						// on tonight beats the standing profile
						if (event.special_genres && event.special_genres.length > 0) {
							bar.rolling_genre_profile = combineGenreProfiles(
								bar.rolling_genre_profile,
								event.special_genres,
								EVENT_GENRE_WEIGHT
							);
							bar.hasEventGenres = true;
						}
					}
				}
			);
		}

		// Fold in the venue's self-description — the artists it says it plays and the genres it
		// declares outright (bars.declared_genres), at one weight — so a venue that never
		// connected Spotify (and so has no bar_genre_profiles row) can still match on its own
		// description of itself. After the events above because the weight depends on them: a
		// venue with an event tonight is described by its line-up, not its self-description.
		const venueArtistGenres = mergeGenresByOwner(
			await listFavouriteGenresForOwners(pool, Array.from(barsMap.keys()), 'bar'),
			await listDeclaredGenresForOwners(pool, Array.from(barsMap.keys()))
		);
		venueArtistGenres.forEach((venueGenres, barId) => {
			const bar = barsMap.get(barId);
			if (!bar || venueGenres.length === 0) return;
			bar.rolling_genre_profile = combineGenreProfiles(
				bar.rolling_genre_profile,
				venueGenres,
				bar.hasEventGenres
					? VENUE_ARTIST_GENRE_WEIGHT_WITH_EVENT
					: VENUE_ARTIST_GENRE_WEIGHT_WITHOUT_EVENT
			);
		});

		const bars = Array.from(barsMap.values());

		if (bars.length === 0) {
			console.log(`No bars found in ${normalizedCity} for date ${date}`);
			return json([]);
		}

		console.log(`Found ${bars.length} bars, now calculating genre matches`);

		// Further expand compound genres (e.g., "deep/tech house" -> ["deep house", "tech house"])
		const fullyExpandedGenres = expandCompoundGenres(expandedGenres);
		console.log('Fully expanded user genres:', fullyExpandedGenres);

		// Find genre clusters for expanded user genres; the taste profile keeps its weights
		// through expansion, each expanded genre inheriting the weight of its source
		const userClusters =
			profileGenres.length > 0
				? findWeightedClusters(
						expandWeightedProfile(profileGenreWeights, (g) =>
							expandCompoundGenres(expandGenreGroups(g))
						)
					)
				: findClusters(fullyExpandedGenres);

		if (userClusters.length === 0) {
			console.log('No clusters found for user genres, returning all bars without matching');
			return json(bars);
		}

		// Calculate similarity for each bar
		const matchingBars = bars.map((bar) => {
			// Process bar genres including event genres. The profile is a genre -> weight map and
			// the weights now count: the strongest genre weighs 1, the rest their share of it
			// (KNOWN_ISSUES 32)
			const venueClusters = findWeightedClusters(bar.rolling_genre_profile ?? {});

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

			// Format current track information - only show if recent (within last 10 minutes)
			let currentTrack = null;
			if (bar.current_track && bar.timestamp) {
				const trackAge = Date.now() - new Date(bar.timestamp).getTime();
				const tenMinutesInMs = 10 * 60 * 1000;
				if (trackAge < tenMinutesInMs) {
					// Try to extract artist from the track name
					const trackParts = bar.current_track.split(' - ');
					if (trackParts.length > 1) {
						currentTrack = {
							name: trackParts[1],
							artist: trackParts[0]
						};
					} else {
						currentTrack = {
							name: bar.current_track,
							artist: 'Unknown Artist'
						};
					}
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
					// Already YYYY-MM-DD ($lib/db keeps DATE columns as strings); rebuilding it with
					// `new Date(...).toISOString()` reported the previous day (KNOWN_ISSUES 17)
					date: event.event_date,
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
