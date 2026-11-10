// The genre cluster matcher: the one copy (KNOWN_ISSUES 22).
//
// Raw genre strings — from a user's taste profile, a venue's declared artists, an event's
// `special_genres`, a scraped club night — are placed into the clusters of
// `$lib/data/genreClusters.json`, and two sets of clusters are then compared. `/clubs`,
// `/barfindr`, `POST /api/mobile/bars/matching` and `POST /api/mobile/events/matching` each
// used to carry their own copy with three different normalisers; this is the `/clubs` one,
// which was the only version that weighted its matches and the only one that kept unknown
// genres out of the score. Callers keep their own *input* preparation (expanding compound
// genres and genre groups, folding event or venue genres into a venue profile) — that is not
// matching.
//
// Server-only ($lib/server): a missing genre is appended to missing-genres.txt for the
// genre-maintenance script, so this module touches the filesystem.
//
// Known limits, both tracked in KNOWN_ISSUES 18: the fuzzy pass makes false friends
// (funk → punk, hip hop → trip hop, edm → idm), and genres no leaf knows at all land in
// Uncategorized, which is excluded from scoring and so simply carries no weight.

import { genreClusters } from '$lib/data/validatedGenreClusters';
import { isFuzzyMatch, isWordBoundaryPartialMatch, makeClusterId } from '$lib/genreSimilarity';
import fs from 'node:fs';
import path from 'node:path';

export type ClusterEntry = {
	genre: string;
	cluster: string;
	subCluster: string;
	weight: number;
};

type ClusterIndexEntry = {
	cluster: string;
	subCluster: string;
};

/**
 * How a genre reached its cluster. Exact names are worth the most, the two fallbacks less, and
 * an unknown genre gets the Uncategorized entry below, which scoring ignores.
 */
const EXACT_MATCH_WEIGHT = 1.0;
const FUZZY_MATCH_WEIGHT = 0.8;
const WORD_BOUNDARY_MATCH_WEIGHT = 0.6;
const UNCATEGORIZED_WEIGHT = 0.3;

export function normalizeGenre(genre: string): string {
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

export function createClusterCacheKey(genres: string[]): string {
	// Sort and stringify to ensure ['techno', 'house'] and ['house', 'techno'] hit same cache
	return JSON.stringify([...genres].sort());
}

export const genreToClusterIndex = new Map<string, ClusterIndexEntry[]>();

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

export function shouldIgnoreGenre(genre: string): boolean {
	const ignoredGenres = [
		'none',
		'soft porn',
		'vaa',
		'idiotic'
		// Add other terms you want to ignore
	];

	return ignoredGenres.some((ignored) => genre.toLowerCase().includes(ignored.toLowerCase()));
}

export function findClusters(genres: string[]): ClusterEntry[] {
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
				weight: EXACT_MATCH_WEIGHT
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
						weight: FUZZY_MATCH_WEIGHT
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
						weight: WORD_BOUNDARY_MATCH_WEIGHT
					});
					found = true;
					break;
				}
			}
		}

		if (!found) {
			if (!missingGenresCache.has(normalizedGenre)) {
				console.warn(`Genre "${normalizedGenre}" not found in any cluster`);
				missingGenresCache.add(normalizedGenre);

				try {
					const logPath = path.join(process.cwd(), 'missing-genres.txt');
					fs.appendFileSync(logPath, `${normalizedGenre}\n`, 'utf8');
				} catch (error) {
					console.error('Failed to log missing genre to file:', error);
				}
			}

			clusters.push({
				genre,
				cluster: 'Uncategorized',
				subCluster: 'Other',
				weight: UNCATEGORIZED_WEIGHT
			});
		}
	});

	// Cache the result before returning
	clusterCache.set(cacheKey, clusters);
	return clusters;
}

// Genres no cluster knows all land in this one fallback id. It must never count as a match:
// otherwise any two unknown genres "match" each other (["Hip-Hop/Rap"] vs ["schlager"] scored
// 1.0, see docs/taste-profile-design.md section 3). Unknown genres carry no information, so
// they are left out of both sides of the similarity; findClusters still returns and logs them.
const UNCATEGORIZED_CLUSTER_ID = makeClusterId('Uncategorized', 'Other');

/**
 * Weighted Jaccard overlap of two cluster sets, and the caller's genres that matched.
 *
 * Each side keeps the best weight it found per cluster, Uncategorized is dropped from both,
 * and the score is the shared weight over the combined weight. Equal sets of exact matches
 * score 1; no shared cluster scores 0.
 */
export function calculateClusterSimilarity(
	userClusters: ClusterEntry[],
	clubClusters: ClusterEntry[]
): { similarity: number; matchingGenres: string[] } {
	const userClusterWeights = new Map<string, number>();
	const clubClusterWeights = new Map<string, number>();

	for (const entry of userClusters) {
		const clusterId = makeClusterId(entry.cluster, entry.subCluster);
		if (clusterId === UNCATEGORIZED_CLUSTER_ID) continue;
		const existing = userClusterWeights.get(clusterId) ?? 0;
		if (entry.weight > existing) {
			userClusterWeights.set(clusterId, entry.weight);
		}
	}

	for (const entry of clubClusters) {
		const clusterId = makeClusterId(entry.cluster, entry.subCluster);
		if (clusterId === UNCATEGORIZED_CLUSTER_ID) continue;
		const existing = clubClusterWeights.get(clusterId) ?? 0;
		if (entry.weight > existing) {
			clubClusterWeights.set(clusterId, entry.weight);
		}
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
