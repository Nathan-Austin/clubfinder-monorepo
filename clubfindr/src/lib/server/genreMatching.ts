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
//   3. UMBRELLA_FAMILIES, for broad terms that name a family of sub-clusters;
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
	UMBRELLA_FAMILIES,
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
	/** For an umbrella family this is the first member, kept for display; scoring uses the family. */
	subCluster: string;
	weight: number;
	/**
	 * Set for an umbrella genre ("house", "jazz"): every sub-cluster the genre covers. Scoring
	 * matches such an entry against any of its members on the other side instead of one fixed
	 * sub-cluster (see calculateClusterSimilarity).
	 */
	familySubClusters?: string[];
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

/**
 * Sub-cluster names, which are genres a user can actually pick: the genre picker offers them as
 * the second level of its menu ("Minimal and Techno", "Gothic and Wave"), and `/clubs` passes
 * what was picked straight to the matcher without expanding groups. They are indexed after the
 * leaves and never over one, so a name that is also a leaf keeps the leaf's home.
 *
 * Without this they resolved only by luck. "Classic House" and "Heavy Metal" happen to be leaves
 * too, so they worked; "Minimal and Techno" reached its cluster through a fuzzy match on
 * "minimal techno" that tightening the fuzzy pass to real typos correctly stopped making, and
 * "Gothic and Wave" and "Mainstream Pop" never had a leaf to be mistaken for at all.
 */
const groupNameHomes: { name: string; cluster: string; subCluster: string }[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function indexSubClusters(subClusters: any[], clusterName: string): void {
	for (const subCluster of subClusters) {
		const subClusterName = subCluster.name;
		const genres = subCluster.genres ?? [];

		for (const genre of genres) {
			addGenreToIndex(genre, clusterName, subClusterName);
		}

		// A group that only holds other groups is a heading, not something to match on.
		if (genres.length > 0) {
			groupNameHomes.push({
				name: subClusterName,
				cluster: clusterName,
				subCluster: subClusterName
			});
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

	for (const group of groupNameHomes) {
		if (!genreToClusterIndex.has(normalizeGenre(group.name))) {
			addGenreToIndex(group.name, group.cluster, group.subCluster);
		}
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

		const pushFamily = (family: { cluster: string; subClusters: string[] }) => {
			clusters.push({
				genre,
				cluster: family.cluster,
				subCluster: family.subClusters[0],
				weight: EXACT_MATCH_WEIGHT,
				familySubClusters: [...family.subClusters]
			});
		};

		// 1. An umbrella family. Deliberately before the leaf lookup: "techno" is also a leaf of
		//    Minimal and Techno, but a person who says techno means the whole family; the leaf
		//    stays as a target for typos and for the other leaves' company.
		const aliased = resolveAlias(normalizedGenre);
		const family = UMBRELLA_FAMILIES[normalizedGenre] ?? UMBRELLA_FAMILIES[aliased];
		if (family) {
			pushFamily(family);
			return;
		}

		// 2. An exact leaf of genreClusters.json.
		const exactEntries = genreToClusterIndex.get(normalizedGenre);
		if (exactEntries && exactEntries.length > 0) {
			push(pickHome(normalizedGenre, exactEntries), EXACT_MATCH_WEIGHT);
			return;
		}

		// 3. A spelling variant or synonym of one.
		if (aliased !== normalizedGenre) {
			const aliasedEntries = genreToClusterIndex.get(aliased);
			if (aliasedEntries && aliasedEntries.length > 0) {
				push(pickHome(aliased, aliasedEntries), EXACT_MATCH_WEIGHT);
				return;
			}
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
 * Scales a profile so its strongest genre weighs 1. Combining sources needs this first: a
 * venue's rolling profile holds play counts that dwarf the fixed weights other sources add
 * (an event's genres, the venue's declared artists), so without it a year of polling drowns
 * out tonight's line-up no matter what weight the line-up is given.
 */
export function scaleProfileToUnit(profile: Record<string, number>): Record<string, number> {
	let maxWeight = 0;
	for (const weight of Object.values(profile)) {
		if (Number.isFinite(weight) && weight > maxWeight) {
			maxWeight = weight;
		}
	}
	if (maxWeight <= 0) {
		// Nothing usable to scale by: every named genre counts fully.
		return Object.fromEntries(Object.keys(profile).map((genre) => [genre, 1]));
	}

	return Object.fromEntries(
		Object.entries(profile).map(([genre, weight]) => [
			genre,
			Number.isFinite(weight) && weight > 0 ? weight / maxWeight : 0
		])
	);
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
 * A side's clusters and umbrella families, each with its aggregated weight. Entries in the same
 * cluster (or family) add up, capped at 1 — two deep-house genres make the venue more of a
 * Deep/Tech House venue, not twice one — and Uncategorized is dropped: unknown genres carry no
 * information (see above).
 */
type SideAggregate = {
	subs: Map<string, number>;
	families: Map<string, { weight: number; memberIds: string[] }>;
};

function aggregateSide(entries: ClusterEntry[]): SideAggregate {
	const subs = new Map<string, number>();
	const families = new Map<string, { weight: number; memberIds: string[] }>();

	for (const entry of entries) {
		if (entry.familySubClusters && entry.familySubClusters.length > 0) {
			const memberIds = entry.familySubClusters
				.map((subCluster) => makeClusterId(entry.cluster, subCluster))
				.sort();
			const familyId = JSON.stringify(memberIds);
			const existing = families.get(familyId);
			if (existing) {
				existing.weight = Math.min(1, existing.weight + entry.weight);
			} else {
				families.set(familyId, { weight: Math.min(1, entry.weight), memberIds });
			}
			continue;
		}

		const clusterId = makeClusterId(entry.cluster, entry.subCluster);
		if (clusterId === UNCATEGORIZED_CLUSTER_ID) continue;
		subs.set(clusterId, Math.min(1, (subs.get(clusterId) ?? 0) + entry.weight));
	}

	return { subs, families };
}

/**
 * What one side's umbrella families matched on the other side.
 *
 * A family matches the other side's weight in any of its member sub-clusters, and the other
 * side's identical family. Two rules keep the sums honest:
 *
 *   - a member the family's own side also names directly is skipped — that overlap was already
 *     counted sub-cluster against sub-cluster;
 *   - a matched sub-cluster is consumed, so two overlapping families on one side ("rock" and
 *     "indie") cannot both claim the same Alternative Rock weight. Families are visited in
 *     sorted order so the winner is deterministic.
 *
 * In the denominator a family counts for what it matched, never less than its own weight
 * (`max(weight, matched)`). That is the point of families: naming "house" against a pure
 * acid-house venue scores 1 — the umbrella is wholly satisfied — while against a venue playing
 * every kind of house the family absorbs all of it instead of capping the match at 1 and
 * leaving three house sub-clusters to count as unmatched.
 */
function matchFamilies(
	side: SideAggregate,
	other: SideAggregate,
	consumedOther: Set<string>,
	matchedFamilyIds: Set<string>,
	countFamilyPairs: boolean
): { matched: number; denominator: number } {
	let matched = 0;
	let denominator = 0;

	for (const familyId of [...side.families.keys()].sort()) {
		const family = side.families.get(familyId)!;
		let memberMatched = 0;

		for (const memberId of family.memberIds) {
			if (side.subs.has(memberId)) continue; // already counted sub against sub
			if (consumedOther.has(memberId)) continue;
			const otherWeight = other.subs.get(memberId);
			if (otherWeight === undefined) continue;
			memberMatched += Math.min(family.weight, otherWeight);
			consumedOther.add(memberId);
		}

		// The same umbrella on both sides matches directly. It reaches the score once (the first
		// pass), but it belongs in BOTH families' denominators: a family's denominator must cover
		// everything it matched, or a side matching through members and the pair at once would
		// push the score past 1.
		let pairMatch = 0;
		const otherFamily = other.families.get(familyId);
		if (otherFamily) {
			pairMatch = Math.min(family.weight, otherFamily.weight);
			if (pairMatch > 0) matchedFamilyIds.add(familyId);
		}

		matched += memberMatched + (countFamilyPairs ? pairMatch : 0);
		denominator += Math.max(family.weight, memberMatched + pairMatch);
		if (memberMatched > 0) matchedFamilyIds.add(familyId);
	}

	return { matched, denominator };
}

/**
 * Weighted Jaccard overlap of two cluster sets, and the caller's genres that matched.
 *
 * Each side's entries are aggregated per cluster (summed, capped at 1), Uncategorized is
 * dropped from both, umbrella families match any of their member sub-clusters (see
 * matchFamilies), and the score is the shared weight over the combined weight. Equal sets of
 * exact matches score 1; no shared cluster scores 0. Through findWeightedClusters the entry
 * weights carry how much of each genre a side plays, so a venue that played one track of
 * afrobeats no longer ranks beside one whose every set is afrobeats (KNOWN_ISSUES 32).
 */
export function calculateClusterSimilarity(
	userClusters: ClusterEntry[],
	clubClusters: ClusterEntry[]
): { similarity: number; matchingGenres: string[] } {
	const user = aggregateSide(userClusters);
	const club = aggregateSide(clubClusters);

	let userWeightedSum = 0;
	for (const weight of user.subs.values()) {
		userWeightedSum += weight;
	}

	let clubWeightedSum = 0;
	for (const weight of club.subs.values()) {
		clubWeightedSum += weight;
	}

	const matchingClusterIds = new Set<string>();
	let matchingWeightedSum = 0;
	for (const [clusterId, userWeight] of user.subs) {
		const clubWeight = club.subs.get(clusterId);
		if (clubWeight !== undefined) {
			matchingClusterIds.add(clusterId);
			matchingWeightedSum += Math.min(userWeight, clubWeight);
		}
	}

	// Family matches. Sub-clusters a family absorbs are consumed per side, and a family pair
	// present on both sides is scored once (countFamilyPairs on the first pass only).
	const matchedFamilyIds = new Set<string>();
	const consumedClub = new Set<string>();
	const consumedUser = new Set<string>();
	const userFamilies = matchFamilies(user, club, consumedClub, matchedFamilyIds, true);
	const clubFamilies = matchFamilies(club, user, consumedUser, matchedFamilyIds, false);

	const totalMatch = matchingWeightedSum + userFamilies.matched + clubFamilies.matched;
	const denominator =
		userWeightedSum +
		userFamilies.denominator +
		clubWeightedSum +
		clubFamilies.denominator -
		totalMatch;
	const similarityScore = denominator === 0 ? 0 : totalMatch / denominator;

	const matchingGenres = [
		...new Set(
			userClusters
				.filter((uc) => {
					if (uc.familySubClusters && uc.familySubClusters.length > 0) {
						const familyId = JSON.stringify(
							uc.familySubClusters.map((sc) => makeClusterId(uc.cluster, sc)).sort()
						);
						return matchedFamilyIds.has(familyId);
					}
					const clusterId = makeClusterId(uc.cluster, uc.subCluster);
					return matchingClusterIds.has(clusterId) || consumedUser.has(clusterId);
				})
				.map((uc) => uc.genre)
		)
	];

	return { similarity: similarityScore, matchingGenres };
}
