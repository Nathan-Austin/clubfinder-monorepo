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
// A genre is resolved in this order (KNOWN_ISSUES 18):
//
//   1. an exact leaf of genreClusters.json, its home taken from CANONICAL_HOMES when the JSON
//      lists the leaf under several sub-clusters;
//   2. the same, after following GENRE_ALIASES (spelling variants and synonyms);
//   3. UMBRELLA_HOMES, for broad terms that are sub-cluster names rather than leaves;
//   4. UNSCORED_GENRES, for genres with no home in the tree and for tags too broad to mean
//      anything — these go straight to Uncategorized rather than being guessed at;
//   5. the fuzzy pass, then the word-boundary pass, each taking the best candidate rather than
//      the first one the index happens to yield;
//   6. Uncategorized, which scoring excludes, plus a line in missing-genres.txt.
//
// Steps 1-4 are the alias layer; before it existed everything broad fell through to step 5 and
// produced false friends (funk → Traditional Punk, hip hop → Trip Hop, dnb → Dub,
// country → Hip-Hop/Rap "Latin and Regional Variants", classical → Chamber Pop).
//
// Weights (KNOWN_ISSUES 32): each ClusterEntry carries a weight that is the product of two
// things — how the genre reached its cluster (exact 1.0, fuzzy 0.8, word-boundary 0.6) and,
// through findWeightedClusters, how much of the genre the profile says its side plays,
// normalised so each side's strongest genre counts 1. findClusters alone leaves the second
// factor at 1, which is the right reading of a plain list: every genre named counts fully.

import {
	CANONICAL_HOMES,
	NO_HOME_GENRE_SET,
	UMBRELLA_HOMES,
	UNSCORED_GENRE_SET,
	resolveAlias
} from '$lib/data/genreAliases';
import { genreClusters } from '$lib/data/validatedGenreClusters';
import { fuzzyMatchScore, makeClusterId, wordBoundaryMatchScore } from '$lib/genreSimilarity';
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

/**
 * The home a leaf resolves to. A leaf that `genreClusters.json` lists under several sub-clusters
 * takes its CANONICAL_HOMES entry; without one the first index entry wins, which is JSON order.
 */
function pickHome(normalizedGenre: string, entries: ClusterIndexEntry[]): ClusterIndexEntry {
	if (entries.length > 1) {
		const canonical = CANONICAL_HOMES[normalizedGenre];
		if (canonical) {
			return { cluster: canonical.cluster, subCluster: canonical.subCluster };
		}
	}

	return entries[0];
}

/** The best fuzzy candidate in the index, or null. Ties break on the candidate name. */
function findBestFuzzyHome(normalizedGenre: string): ClusterIndexEntry | null {
	let bestScore = 0;
	let bestGenre = '';
	let best: ClusterIndexEntry[] | null = null;

	for (const [candidateGenre, entries] of genreToClusterIndex) {
		const score = fuzzyMatchScore(normalizedGenre, candidateGenre);
		if (score > bestScore || (score > 0 && score === bestScore && candidateGenre < bestGenre)) {
			bestScore = score;
			bestGenre = candidateGenre;
			best = entries;
		}
	}

	return best ? pickHome(bestGenre, best) : null;
}

/** The best word-boundary candidate in the index, or null. Ties break on the candidate name. */
function findBestWordBoundaryHome(normalizedGenre: string): ClusterIndexEntry | null {
	let bestScore = 0;
	let bestGenre = '';
	let best: ClusterIndexEntry[] | null = null;

	for (const [candidateGenre, entries] of genreToClusterIndex) {
		const score = wordBoundaryMatchScore(normalizedGenre, candidateGenre);
		if (score > bestScore || (score > 0 && score === bestScore && candidateGenre < bestGenre)) {
			bestScore = score;
			bestGenre = candidateGenre;
			best = entries;
		}
	}

	return best ? pickHome(bestGenre, best) : null;
}

function logMissingGenre(normalizedGenre: string): void {
	if (missingGenresCache.has(normalizedGenre)) {
		return;
	}

	console.warn(`Genre "${normalizedGenre}" not found in any cluster`);
	missingGenresCache.add(normalizedGenre);

	try {
		const logPath = path.join(process.cwd(), 'missing-genres.txt');
		fs.appendFileSync(logPath, `${normalizedGenre}\n`, 'utf8');
	} catch (error) {
		console.error('Failed to log missing genre to file:', error);
	}
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

		const push = (home: ClusterIndexEntry, weight: number) => {
			clusters.push({
				genre,
				cluster: home.cluster,
				subCluster: home.subCluster,
				weight
			});
		};

		const uncategorized = () => {
			clusters.push({
				genre,
				cluster: 'Uncategorized',
				subCluster: 'Other',
				weight: UNCATEGORIZED_WEIGHT
			});
		};

		// 1. An exact leaf of genreClusters.json.
		const exactEntries = genreToClusterIndex.get(normalizedGenre);
		if (exactEntries && exactEntries.length > 0) {
			push(pickHome(normalizedGenre, exactEntries), EXACT_MATCH_WEIGHT);
			return;
		}

		// 2. A spelling variant or synonym of one.
		const aliased = resolveAlias(normalizedGenre);
		if (aliased !== normalizedGenre) {
			const aliasedEntries = genreToClusterIndex.get(aliased);
			if (aliasedEntries && aliasedEntries.length > 0) {
				push(pickHome(aliased, aliasedEntries), EXACT_MATCH_WEIGHT);
				return;
			}
		}

		// 3. A broad term that names a sub-cluster rather than a leaf.
		const umbrella = UMBRELLA_HOMES[aliased];
		if (umbrella) {
			push({ cluster: umbrella.cluster, subCluster: umbrella.subCluster }, EXACT_MATCH_WEIGHT);
			return;
		}

		// 4. Nowhere to put it, or too broad to mean anything. Guessing here is worse than
		//    carrying no weight, since a wrong cluster actively misranks venues.
		if (UNSCORED_GENRE_SET.has(aliased)) {
			if (NO_HOME_GENRE_SET.has(aliased)) {
				logMissingGenre(aliased);
			}
			uncategorized();
			return;
		}

		// 5. Typo tolerance, then a shared whole word.
		const fuzzyHome = findBestFuzzyHome(normalizedGenre);
		if (fuzzyHome) {
			push(fuzzyHome, FUZZY_MATCH_WEIGHT);
			return;
		}

		const wordBoundaryHome = findBestWordBoundaryHome(normalizedGenre);
		if (wordBoundaryHome) {
			push(wordBoundaryHome, WORD_BOUNDARY_MATCH_WEIGHT);
			return;
		}

		// 6. Unknown. Scoring excludes Uncategorized, so this carries no weight either way.
		logMissingGenre(normalizedGenre);
		uncategorized();
	});

	// Cache the result before returning
	clusterCache.set(cacheKey, clusters);
	return clusters;
}

/**
 * findClusters for a weighted profile (`genre → weight`), e.g. a venue's rolling genre profile
 * or a user's artist counts. Each entry's match weight is multiplied by the genre's share of the
 * profile's strongest weight, so the side's dominant genre counts 1 and one stray track of
 * something counts almost nothing — regardless of whether the raw numbers are play counts from
 * a year of polling or three picked artists (KNOWN_ISSUES 32).
 *
 * Weights that are not positive finite numbers count as 0. A profile with no usable weight at
 * all falls back to findClusters' plain reading: every genre counts fully.
 */
export function findWeightedClusters(profile: Record<string, number>): ClusterEntry[] {
	const genres = Object.keys(profile);
	const entries = findClusters(genres);

	let maxWeight = 0;
	for (const weight of Object.values(profile)) {
		if (Number.isFinite(weight) && weight > maxWeight) {
			maxWeight = weight;
		}
	}
	if (maxWeight <= 0) {
		return entries;
	}

	// findClusters caches and returns the cached array, so scale into new objects.
	return entries.map((entry) => {
		const raw = profile[entry.genre];
		const share = Number.isFinite(raw) && raw > 0 ? raw / maxWeight : 0;
		return { ...entry, weight: entry.weight * share };
	});
}

/**
 * Runs a caller's genre expansion (group names → members, compound genres → parts) over a
 * weighted profile, each expanded genre inheriting the weight of the genre it came from — the
 * best weight, when two sources expand to the same genre. Keeps expansion, which is caller
 * input preparation, out of the matcher while letting an expanded profile stay weighted.
 */
export function expandWeightedProfile(
	profile: Record<string, number>,
	expand: (genres: string[]) => string[]
): Record<string, number> {
	const expanded: Record<string, number> = {};
	for (const [genre, weight] of Object.entries(profile)) {
		for (const expandedGenre of expand([genre])) {
			expanded[expandedGenre] = Math.max(expanded[expandedGenre] ?? 0, weight);
		}
	}
	return expanded;
}

// Genres no cluster knows all land in this one fallback id. It must never count as a match:
// otherwise any two unknown genres "match" each other (["Hip-Hop/Rap"] vs ["schlager"] scored
// 1.0, see docs/taste-profile-design.md section 3). Unknown genres carry no information, so
// they are left out of both sides of the similarity; findClusters still returns and logs them.
const UNCATEGORIZED_CLUSTER_ID = makeClusterId('Uncategorized', 'Other');

/**
 * A side's clusters and their weights. Entries in the same cluster add up, capped at 1 — two
 * deep-house genres make the venue more of a Deep/Tech House venue, not twice one — and
 * Uncategorized is dropped: unknown genres carry no information (see above).
 */
function aggregateClusterWeights(entries: ClusterEntry[]): Map<string, number> {
	const weights = new Map<string, number>();

	for (const entry of entries) {
		const clusterId = makeClusterId(entry.cluster, entry.subCluster);
		if (clusterId === UNCATEGORIZED_CLUSTER_ID) continue;
		weights.set(clusterId, Math.min(1, (weights.get(clusterId) ?? 0) + entry.weight));
	}

	return weights;
}

/**
 * Weighted Jaccard overlap of two cluster sets, and the caller's genres that matched.
 *
 * Each side's entries are aggregated per cluster (summed, capped at 1), Uncategorized is
 * dropped from both, and the score is the shared weight over the combined weight. Equal sets of
 * exact matches score 1; no shared cluster scores 0. Through findWeightedClusters the entry
 * weights carry how much of each genre a side plays, so a venue that played one track of
 * afrobeats no longer ranks beside one whose every set is afrobeats (KNOWN_ISSUES 32).
 */
export function calculateClusterSimilarity(
	userClusters: ClusterEntry[],
	clubClusters: ClusterEntry[]
): { similarity: number; matchingGenres: string[] } {
	const userClusterWeights = aggregateClusterWeights(userClusters);
	const clubClusterWeights = aggregateClusterWeights(clubClusters);

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
