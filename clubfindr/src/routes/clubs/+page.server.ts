// clubs/+page.server.ts */
import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { pool } from '$lib/db';
import type { PageServerLoad } from './$types';
import type { DbDataRow } from '$lib/$types';
import { normalizeCityName } from '$lib/spotifyUtils';
import { cookieManager } from '$lib/cookieManager';
import { getProfileGenreWeightsForSession } from '$lib/taste/profileGenres';
import { genreOverlap } from '$lib/genreSimilarity';
import {
	calculateClusterSimilarity,
	createClusterCacheKey,
	findClusters,
	findWeightedClusters,
	genreToClusterIndex,
	isSimilarityMatch,
	normalizeGenre
} from '$lib/server/genreMatching';
type Genre = string;

type Data = {
	club_name: string;
	popularity: number;
	price: number;
	genres: Genre[];
	event_image: string;
	event_name: string;
	club_address: string;
	event_id: number;
};
type SimilarityResult = {
	club_name: string;
	popularity: number;
	price: number;
	genres: string[];
	similarity: number;
	event_image: string;
	event_name: string;
	club_address: string;
	event_id: number;
	matchingGenres: string[];
};

process.on('SIGINT', async () => {
	await pool.end();
	process.exit();
});

// The matcher itself lives in $lib/server/genreMatching (KNOWN_ISSUES 22).

type MmrCandidate = {
	similarity: number;
	genres: string[];
};

function applyMmrDiversity<T extends MmrCandidate>(
	items: T[],
	maxResults: number,
	diversityWeight: number
): T[] {
	if (maxResults <= 0) {
		return [];
	}

	if (items.length <= 1) {
		return items.slice(0, maxResults);
	}

	const diverseResults: T[] = [];
	const remainingResults = [...items];

	diverseResults.push(remainingResults.shift()!);

	while (remainingResults.length > 0 && diverseResults.length < maxResults) {
		let bestScore = -Infinity;
		let bestIndex = 0;

		for (let i = 0; i < remainingResults.length; i += 1) {
			const candidate = remainingResults[i];
			const minDiversity = Math.min(
				...diverseResults.map((selected) => 1 - genreOverlap(candidate.genres, selected.genres))
			);

			const mmrScore =
				(1 - diversityWeight) * candidate.similarity + diversityWeight * minDiversity;

			if (mmrScore > bestScore) {
				bestScore = mmrScore;
				bestIndex = i;
			}
		}

		diverseResults.push(remainingResults.splice(bestIndex, 1)[0]);
	}

	return diverseResults;
}

export const _findClusters = findClusters;
export const _calculateClusterSimilarity = calculateClusterSimilarity;
export const _normalizeGenre = normalizeGenre;
export const _createClusterCacheKey = createClusterCacheKey;
export const _genreToClusterIndex = genreToClusterIndex;
export const _applyMmrDiversity = applyMmrDiversity;

export const load: PageServerLoad = async ({ cookies, url, depends }) => {
	depends('app:date');
	const cityCookie = cookies.get('city');
	const city = cityCookie ? normalizeCityName(cityCookie) : '';
	const isLoggedIn = cookies.get('isLoggedIn') === 'true';
	let date = cookies.get('date');

	// "Change Date" reloads with ?date=. The cookie is refreshed so the new date survives into
	// the other pages ("Change the vibe", /barfindr) instead of silently reverting (KNOWN_ISSUES 24)
	const updatedDate = url.searchParams.get('date');
	if (updatedDate && /^\d{4}-\d{2}-\d{2}$/.test(updatedDate)) {
		date = updatedDate;
		cookies.set('date', updatedDate, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			maxAge: 3600 // as /storestate sets it
		});
	}

	const address = cookies.get('address');
	let genresList: string[] = [];
	// Set when the taste profile is the genre source: how many favourite artists carry each
	// genre, so matching can weight a mostly-techno profile as mostly techno (KNOWN_ISSUES 32).
	// Explicit picks (the cookie sources above) stay unweighted: naming a genre is asking for it.
	let profileGenreWeights: Record<string, number> | null = null;

	// No search yet (or the one-hour search cookies expired): start over on the home page
	if (!city || !date) {
		redirect(302, '/');
	}

	const sessionId = cookieManager.get(cookies, 'sessionId');

	// Clear prioritization of genre sources. The cookies are read, never deleted: deleting
	// them "after reading" meant a reload, a "Change Date" or a hop to /barfindr lost a
	// guest's genres after one page view (KNOWN_ISSUES 24). They expire on their own
	// (an hour for the search cookies, a day for selected-genres) and every new search
	// overwrites them, so an explicit pick simply wins until it lapses.

	// 1. First priority: Check for explicitly selected genres (highest user intent)
	const selectedGenresCookie = cookies.get('selected-genres');
	if (selectedGenresCookie) {
		genresList = selectedGenresCookie.split(',').map((genre) => genre.trim().toLowerCase());
		genresList = Array.from(new Set(genresList)); // Remove duplicates
	}

	// 2. Second priority: Check for original genre cookie (backwards compatibility)
	if (genresList.length === 0) {
		const genreCookie = cookies.get('genre');
		if (genreCookie) {
			genresList = genreCookie.split(',').map((genre) => genre.trim().toLowerCase());
			genresList = Array.from(new Set(genresList)); // Remove duplicates
		}
	}

	// 3. Third priority: Check for Spotify-generated genres
	if (genresList.length === 0) {
		const spotifyGenresCookie = cookies.get('spotify-genres');
		if (spotifyGenresCookie) {
			genresList = spotifyGenresCookie.split(',').map((genre) => genre.trim().toLowerCase());
			genresList = Array.from(new Set(genresList)); // Remove duplicates
		}
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

	// 5. Fifth priority: the taste profile, the genres of the user's favourite artists
	//    (docs/taste-profile-design.md). Picks for this search and Spotify session genres
	//    above win; this is what logged-in users without Spotify get.
	if (genresList.length === 0 && sessionId) {
		try {
			const weights = await getProfileGenreWeightsForSession(pool, sessionId);
			genresList = Object.keys(weights).sort();
			if (genresList.length > 0) {
				profileGenreWeights = weights;
				console.log('Using genres from the taste profile:', genresList);
			}
		} catch (error) {
			console.error('Error fetching taste profile genres:', error);
		}
	}

	// If no genres were found from any source
	if (genresList.length === 0) {
		console.warn('No genres found from any source. Showing all events without genre filtering.');
		// You could set default genres here if needed
		// genresList = ['electronic', 'house'];
	}

	// Now, query for club events based on city and date
	try {
		const query = `SELECT club_name, popularity, event_id, price, event_genres, event_name, 
		club_address, event_image FROM clubfindr.events WHERE event_date = $2 AND city = $1;`;
		const result = await pool.query(query, [city, date]);

		if (result.rowCount === 0) {
			console.log('No data found in the database.');
			return {
				props: {
					dbData: []
				}
			};
		}

		const dbData = result.rows;

		const preprocessData = async (dbData: DbDataRow[]): Promise<Data[]> => {
			const processedData: Data[] = [];

			for (const row of dbData) {
				// Improved genre handling - handle potential array or string
				let eventGenresArray: string[] = [];

				if (Array.isArray(row.event_genres)) {
					// Handle nested arrays if present
					eventGenresArray = row.event_genres.flatMap((genre) =>
						typeof genre === 'string' ? genre : Array.isArray(genre) ? genre : []
					);
				} else if (typeof row.event_genres === 'string') {
					eventGenresArray = [row.event_genres];
				}

				// Process all genres consistently
				const rowGenres: Genre[] = eventGenresArray.flatMap((genre) =>
					typeof genre === 'string' ? genre.split(',').map((g) => g.trim().toLowerCase()) : []
				);

				if (rowGenres.length === 0) {
					console.log(`No valid genres found for event: ${row.event_id}`);
				} else {
					const preprocessedRow: Data = {
						club_name: row.club_name,
						popularity: row.popularity,
						price: convertPriceToNumeric(row.price),
						genres: rowGenres,
						event_image: row.event_image,
						event_name: row.event_name,
						club_address: row.club_address,
						event_id: row.event_id
					};

					processedData.push(preprocessedRow);
				}
			}

			return processedData;
		};

		// Usage
		const processedData = await preprocessData(dbData);

		//////////////////////CLUSTERING LOGIC/////////////////////////

		const MAX_RESULTS = 100;
		const DIVERSITY_WEIGHT = 0.3;

		const userClusters = profileGenreWeights
			? findWeightedClusters(profileGenreWeights)
			: findClusters(genresList);

		const clubSimilarities = processedData.map((club) => {
			const clubClusters = findClusters(club.genres);

			// Calculate similarity between userClusters and clubClusters
			const { similarity: similarityScore, matchingGenres } = calculateClusterSimilarity(
				userClusters,
				clubClusters
			);

			return {
				...club,
				similarity: similarityScore,
				matchingGenres
			};
		});

		const sortedByScore = [...clubSimilarities].sort((a, b) => b.similarity - a.similarity);

		// Everything that shares a cluster, best first, capped (see MIN_SIMILARITY). This used to
		// start at 0.1 and, when fewer than 50 clubs cleared it, drop to the 50th club's score but
		// never below 0.05 — which cut a broad listener's real matches, since a wide profile's
		// scores are low across the board. Ranking and the MMR pass below order what is shown.
		const filteredSimilarities = sortedByScore
			.filter((club) => isSimilarityMatch(club.similarity))
			.slice(0, MAX_RESULTS);
		const diverseSimilarities = applyMmrDiversity(
			filteredSimilarities,
			MAX_RESULTS,
			DIVERSITY_WEIGHT
		);

		// Map all matching clubs to the desired structure
		const serverSimilarityResults: SimilarityResult[] = diverseSimilarities.map((similarity) => {
			return {
				...similarity
			};
		});

		console.log('serverside_similarityResult:', serverSimilarityResults);

		return {
			props: {
				serverSimilarityResults,
				date,
				city,
				address,
				isLoggedIn
			}
		};
	} catch (error) {
		console.error('Error fetching data:', (error as Error).message);
		return {
			props: {
				date,
				error: (error as Error).message
			}
		};
	} finally {
		// eslint-disable-next-line no-empty
		if (pool) {
		}
	}
};

function convertPriceToNumeric(priceStr: string | null): number {
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
}
