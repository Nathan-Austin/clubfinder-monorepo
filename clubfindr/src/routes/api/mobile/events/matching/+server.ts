import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import genreClusters from '$lib/data/genreClusters.json';
import { normalizeCityName } from '$lib/spotifyUtils';
import { getProfileGenresForRequest } from '$lib/taste/profileGenres';
import {
	calculateClusterSimilarity,
	findClusters,
	normalizeGenre
} from '$lib/server/genreMatching';

// Helper functions for genre matching - same as web implementation
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

// Helper for price conversion
const convertPriceToNumeric = (priceStr: string | null): number => {
	if (!priceStr) return 0;

	// Remove unwanted characters except digits, dots, commas, slashes, and hyphens
	priceStr = priceStr.replace(/[^\d.,/-]/g, '');

	// Replace commas with dots to standardize decimal points
	priceStr = priceStr.replace(/,/g, '.');

	// Split the string on slashes and hyphens to handle ranges and multiple prices
	const separators = /[/-]/;
	const parts = priceStr.split(separators);

	const numbers: number[] = [];

	for (let part of parts) {
		part = part.trim();
		if (part.length === 0) continue;

		// Parse the number and check for validity
		const parsedValue = parseFloat(part);
		if (!isNaN(parsedValue)) {
			numbers.push(parsedValue);
		}
	}

	if (numbers.length === 0) {
		// No valid numbers found
		return 0;
	}

	// Return the minimum price found
	return Math.min(...numbers);
};

/**
 * Get club events that match user's music preferences
 * Endpoint: POST /api/mobile/events/matching
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { city, date, genres } = await request.json();

		if (!city) {
			return json(
				{
					success: false,
					message: 'City parameter is required'
				},
				{ status: 400 }
			);
		}

		if (!date) {
			return json(
				{
					success: false,
					message: 'Date parameter is required'
				},
				{ status: 400 }
			);
		}

		// Genres the caller picked win; a logged-in caller that sends none is matched on its
		// taste profile instead, the way /clubs and /barfindr already do it (KNOWN_ISSUES 22).
		// The app authenticates with the Bearer token from its login.
		const sentGenres = Array.isArray(genres) ? genres.filter((g) => typeof g === 'string') : [];
		const profileGenres =
			sentGenres.length > 0 ? [] : await getProfileGenresForRequest(pool, cookies, request);
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

		// Expand any genre group names to their individual genres
		// e.g., "Reggaeton and Dembow" -> ["Reggaeton", "Dembow", "Trap Latino", ...]
		const expandedGenres = expandGenreGroups(effectiveGenres);

		console.log(
			`Finding matching events in ${normalizedCity} for date ${date} with ${effectiveGenres.length} genres (expanded to ${expandedGenres.length})`
		);

		// Get all events for the specified city and date
		const eventsQuery = `
      SELECT 
        e.id,
        e.event_id as source_event_id,
        e.event_name as name,
        e.club_name,
        e.club_address as address,
        e.event_date as date,
        e.start_time,
        e.end_time,
        e.popularity,
        e.price,
        e.event_image,
        e.city,
        e.event_genres as genres,
        COALESCE(
          (SELECT json_agg(json_build_object('id', a.id, 'name', a.artist_name))
           FROM clubfindr.event_artists ea
           JOIN clubfindr.artists a ON ea.artist_id = a.id
           WHERE ea.event_id = e.id),
          '[]'::json
        ) as artists
      FROM clubfindr.events e
      WHERE e.city = $1 AND e.event_date = $2::date
      ORDER BY e.start_time ASC;
    `;

		const eventsResult = await pool.query(eventsQuery, [normalizedCity, date]);

		if (eventsResult.rowCount === 0) {
			console.log(`No events found in ${normalizedCity} for date ${date}`);
			return json([]);
		}

		const events = eventsResult.rows;
		console.log(`Found ${events.length} events, now calculating genre matches`);

		// Find genre clusters for expanded user genres
		const userClusters = findClusters(expandedGenres);

		if (userClusters.length === 0) {
			console.log('No clusters found for user genres, returning all events without matching');

			// Format events
			const formattedEvents = events.map((event) => ({
				...event,
				genres: Array.isArray(event.genres) ? event.genres : [],
				price: convertPriceToNumeric(event.price),
				venueType: 'club' // Add venue type for client
			}));

			return json(formattedEvents);
		}

		// Calculate similarity for each event
		const matchingEvents = events.map((event) => {
			// Process event genres
			const eventGenres = Array.isArray(event.genres) ? event.genres : [];
			const eventClusters = findClusters(eventGenres);

			// Calculate similarity
			const { similarity, matchingGenres } = calculateClusterSimilarity(
				userClusters,
				eventClusters
			);

			// Process price to numeric
			const numericPrice = convertPriceToNumeric(event.price);

			// Return the event with similarity score and matching genres
			return {
				...event,
				genres: eventGenres,
				similarity: similarity,
				matchingGenres: matchingGenres,
				price: numericPrice,
				venueType: 'club' // Add venue type for client
			};
		});

		// Filter out events with similarity score below threshold
		const filteredEvents = matchingEvents
			.filter((event) => event.similarity > 0.1)
			.sort((a, b) => b.similarity - a.similarity);

		console.log(`Returning ${filteredEvents.length} matching events`);
		return json(filteredEvents);
	} catch (error) {
		console.error('Error finding matching events:', error);
		return json(
			{
				success: false,
				message: 'Failed to find matching events',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
