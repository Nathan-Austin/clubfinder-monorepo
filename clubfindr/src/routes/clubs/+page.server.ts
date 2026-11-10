// clubs/+page.server.ts */
import { redirect } from '@sveltejs/kit';
import { pool } from '$lib/db';
import type { PageServerLoad } from './$types';
import type { DbDataRow } from '$lib/$types';
import { normalizeCityName } from '$lib/spotifyUtils';
import { cookieManager } from '$lib/cookieManager';
import { getProfileGenresForSession } from '$lib/taste/profileGenres';
import { genreOverlap } from '$lib/genreSimilarity';
import {
	calculateClusterSimilarity,
	createClusterCacheKey,
	findClusters,
	genreToClusterIndex,
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

	const updatedDate = url.searchParams.get('date');
	if (updatedDate) {
		date = updatedDate;
	}

	const address = cookies.get('address');
	let genresList: string[] = [];

	// No search yet (or the one-hour search cookies expired): start over on the home page
	if (!city || !date) {
		redirect(302, '/');
	}

	const sessionId = cookieManager.get(cookies, 'sessionId');

	// Clear prioritization of genre sources:

	// 1. First priority: Check for explicitly selected genres (highest user intent)
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

	// 2. Second priority: Check for original genre cookie (backwards compatibility)
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

	// 3. Third priority: Check for Spotify-generated genres
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
			genresList = await getProfileGenresForSession(pool, sessionId);
			if (genresList.length > 0) {
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

		const MIN_SIMILARITY = 0.05;
		const TARGET_RESULTS = 50;
		const MAX_RESULTS = 100;
		const DEFAULT_SIMILARITY_THRESHOLD = 0.1;
		const DIVERSITY_WEIGHT = 0.3;

		const userClusters = findClusters(genresList);

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
		let threshold = DEFAULT_SIMILARITY_THRESHOLD;

		if (sortedByScore.filter((club) => club.similarity > threshold).length < TARGET_RESULTS) {
			threshold = Math.max(
				MIN_SIMILARITY,
				sortedByScore[TARGET_RESULTS - 1]?.similarity ?? MIN_SIMILARITY
			);
		}

		const filteredSimilarities = sortedByScore
			.filter((club) => club.similarity >= threshold)
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
