// clubs/+page.server.ts */
import { pool } from '$lib/db';
import type { PageServerLoad } from './$types';
import type { DbDataRow } from '$lib/$types';
import { genreClusters } from '$lib/data/validatedGenreClusters';
import { normalizeCityName } from '$lib/spotifyUtils';
import { cookieManager } from '$lib/cookieManager';
import { isFuzzyMatch, isWordBoundaryPartialMatch, makeClusterId } from '$lib/genreSimilarity';
type Genre = string;

type ClusterEntry = {
	genre: string;
	cluster: string;
	subCluster: string;
	weight: number;
};

type ClusterIndexEntry = {
	cluster: string;
	subCluster: string;
};

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

function normalizeGenre(genre: string): string {
	return genre
		.toLowerCase()
		.trim()
		.replace(/\s*&\s*/g, ' and ') // Replace & with "and"
		.replace(/\s*\/\s*/g, ' / ') // Preserve slash as delimiter
		.replace(/'/g, '') // Remove apostrophes
		.replace(/\s+/g, ' '); // Normalize spaces
}

const missingGenresCache = new Set<string>();

// Cache for findClusters results to avoid redundant computation
const clusterCache = new Map<string, ClusterEntry[]>();

function createClusterCacheKey(genres: string[]): string {
	// Sort and stringify to ensure ['techno', 'house'] and ['house', 'techno'] hit same cache
	return JSON.stringify([...genres].sort());
}

const genreToClusterIndex = new Map<string, ClusterIndexEntry[]>();

function addGenreToIndex(genre: string, cluster: string, subCluster: string): void {
	const normalizedGenre = normalizeGenre(genre);
	const existing = genreToClusterIndex.get(normalizedGenre);

	const entry = { cluster, subCluster };
	if (existing) {
		existing.push(entry);
	} else {
		genreToClusterIndex.set(normalizedGenre, [entry]);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function indexSubClusters(subClusters: any[], clusterName: string): void {
	for (const subCluster of subClusters) {
		const subClusterName = subCluster.name;
		const genres = subCluster.genres ?? [];

		for (const genre of genres) {
			addGenreToIndex(genre, clusterName, subClusterName);
		}

		if (subCluster.sub_clusters) {
			indexSubClusters(subCluster.sub_clusters, clusterName);
		}
	}
}

function buildGenreIndex(): void {
	for (const cluster of genreClusters.clusters) {
		indexSubClusters(cluster.sub_clusters, cluster.name);
	}
}

buildGenreIndex();

// Export for testing only (SvelteKit requires _ prefix for non-standard exports)

function shouldIgnoreGenre(genre: string): boolean {
	const ignoredGenres = [
		'none',
		'soft porn',
		'vaa',
		'idiotic'
		// Add other terms you want to ignore
	];

	return ignoredGenres.some((ignored) => genre.toLowerCase().includes(ignored.toLowerCase()));
}

function findClusters(genres: string[]): ClusterEntry[] {
	// Check cache first
	const cacheKey = createClusterCacheKey(genres);
	const cached = clusterCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const clusters: ClusterEntry[] = [];

	genres.forEach((genre) => {
		const normalizedGenre = normalizeGenre(genre);

		// Skip empty genres or very short strings
		if (!normalizedGenre || normalizedGenre.length < 2) {
			return;
		}

		// Skip ignored genres without logging
		if (shouldIgnoreGenre(normalizedGenre)) {
			return;
		}

		let found = false;

		const exactEntries = genreToClusterIndex.get(normalizedGenre);
		if (exactEntries && exactEntries.length > 0) {
			const entry = exactEntries[0];
			clusters.push({
				genre,
				cluster: entry.cluster,
				subCluster: entry.subCluster,
				weight: 1.0
			});
			found = true;
		}

		if (!found) {
			for (const [candidateGenre, entries] of genreToClusterIndex) {
				if (isFuzzyMatch(normalizedGenre, candidateGenre)) {
					const entry = entries[0];
					clusters.push({
						genre,
						cluster: entry.cluster,
						subCluster: entry.subCluster,
						weight: 0.8
					});
					found = true;
					break;
				}
			}
		}

		if (!found) {
			for (const [candidateGenre, entries] of genreToClusterIndex) {
				if (isWordBoundaryPartialMatch(normalizedGenre, candidateGenre)) {
					const entry = entries[0];
					clusters.push({
						genre,
						cluster: entry.cluster,
						subCluster: entry.subCluster,
						weight: 0.6
					});
					found = true;
					break;
				}
			}
		}

		if (!found && !missingGenresCache.has(normalizedGenre)) {
			// Only log each missing genre once per server session
			console.warn(`Genre ${normalizedGenre} not found in any cluster`);
			missingGenresCache.add(normalizedGenre);

			// Optionally, record the missing genre for later processing
			// This could append to a file for batch processing with the genre classifier
			// fs.appendFileSync('missing-genres.txt', normalizedGenre + '\n');
		}
	});

	// Cache the result before returning
	clusterCache.set(cacheKey, clusters);
	return clusters;
}

function calculateClusterSimilarity(
	userClusters: ClusterEntry[],
	clubClusters: ClusterEntry[]
): { similarity: number; matchingGenres: string[] } {
	const userClusterWeights = new Map<string, number>();
	const clubClusterWeights = new Map<string, number>();

	for (const entry of userClusters) {
		const clusterId = makeClusterId(entry.cluster, entry.subCluster);
		const existing = userClusterWeights.get(clusterId) ?? 0;
		if (entry.weight > existing) {
			userClusterWeights.set(clusterId, entry.weight);
		}
	}

	for (const entry of clubClusters) {
		const clusterId = makeClusterId(entry.cluster, entry.subCluster);
		const existing = clubClusterWeights.get(clusterId) ?? 0;
		if (entry.weight > existing) {
			clubClusterWeights.set(clusterId, entry.weight);
		}
	}

	if (userClusterWeights.size === 0 && clubClusterWeights.size === 0) {
		console.warn('Union size is zero, returning similarity as 0 to avoid NaN.');
	}

	let userWeightedSum = 0;
	for (const weight of userClusterWeights.values()) {
		userWeightedSum += weight;
	}

	let clubWeightedSum = 0;
	for (const weight of clubClusterWeights.values()) {
		clubWeightedSum += weight;
	}

	const matchingClusterIds = new Set<string>();
	let matchingWeightedSum = 0;
	for (const [clusterId, userWeight] of userClusterWeights) {
		const clubWeight = clubClusterWeights.get(clusterId);
		if (clubWeight !== undefined) {
			matchingClusterIds.add(clusterId);
			matchingWeightedSum += Math.min(userWeight, clubWeight);
		}
	}

	const denominator = userWeightedSum + clubWeightedSum - matchingWeightedSum;
	const similarityScore = denominator === 0 ? 0 : matchingWeightedSum / denominator;

	const matchingGenres = [
		...new Set(
			userClusters
				.filter((uc) => matchingClusterIds.has(makeClusterId(uc.cluster, uc.subCluster)))
				.map((uc) => uc.genre)
		)
	];

	return { similarity: similarityScore, matchingGenres };
}

export const _findClusters = findClusters;
export const _calculateClusterSimilarity = calculateClusterSimilarity;
export const _normalizeGenre = normalizeGenre;
export const _createClusterCacheKey = createClusterCacheKey;
export const _genreToClusterIndex = genreToClusterIndex;

export const load: PageServerLoad = async ({ cookies, url, depends }) => {
	depends('app:date');
	const city = normalizeCityName(cookies.get('city') || '');
	const isLoggedIn = cookies.get('isLoggedIn') === 'true';
	let date = cookies.get('date');

	const updatedDate = url.searchParams.get('date');
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
		throw new Error('Date not found in cookies');
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

		const userClusters = findClusters(genresList);

		const clubSimilarities = processedData
			.map((club) => {
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
			})
			// Filter out entries with similarity score of 0
			.filter((club) => club.similarity > 0.1);

		// Sort the filtered clubSimilarities array in descending order based on similarity
		clubSimilarities.sort((a, b) => b.similarity - a.similarity);

		// Map all matching clubs to the desired structure
		const serverSimilarityResults: SimilarityResult[] = clubSimilarities.map((similarity) => {
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
