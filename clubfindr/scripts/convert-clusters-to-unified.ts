#!/usr/bin/env ts-node
/**
 * Convert genreClusters.json to unified-genres.json format
 *
 * This script converts the genreClusters.json file (used by the backend for matching)
 * to the unified-genres.json format (used by the frontend genre selection UI).
 *
 * genreClusters.json structure:
 * {
 *   clusters: [
 *     {
 *       name: "Category Name",
 *       sub_clusters: [
 *         {
 *           name: "Subgenre Name",
 *           genres: ["genre1", "genre2"]
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * unified-genres.json structure:
 * {
 *   categories: [
 *     {
 *       name: "Category Name",
 *       subgenres: [
 *         {
 *           name: "Subgenre Name",
 *           genres: ["genre1", "genre2"],
 *           subsubgenres: [
 *             {
 *               name: "Specific Genre Group",
 *               genres: ["specific1", "specific2"]
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Pure data modules (no $lib imports), so a plain tsc build can pull them in
import {
	CANONICAL_HOMES,
	GENRE_ALIASES,
	UMBRELLA_FAMILIES,
	UNSCORED_GENRE_SET,
	resolveAlias
} from '../src/lib/data/genreAliases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve APP_ROOT from the script location, accounting for build output in dist-scripts
const APP_ROOT = __dirname.includes('dist-scripts')
	? path.resolve(__dirname, '../..')
	: path.resolve(__dirname, '..');

const GENRE_CLUSTERS_PATH = path.resolve(APP_ROOT, './src/lib/data/genreClusters.json');
const UNIFIED_GENRES_WEB_PATH = path.resolve(APP_ROOT, './static/lib/unified-genres.json');
const UNIFIED_GENRES_MOBILE_PATH = path.resolve(
	APP_ROOT,
	'../app_clubfindr/src/constants/unified-genres.json'
);
// The one list of genres anything may suggest (KNOWN_ISSUES 91): flat, and exactly what the
// server's isKnownGenre accepts. src/lib/taste/genreSuggestions.test.ts holds the two together.
const SUGGESTIONS_WEB_PATH = path.resolve(APP_ROOT, './static/lib/genre-suggestions.json');
const SUGGESTIONS_MOBILE_PATH = path.resolve(
	APP_ROOT,
	'../app_clubfindr/src/constants/genre-suggestions.json'
);
// Every genre the matcher places by name, with its top-level cluster, for the scrape
// (KNOWN_ISSUES 94): data_collection keeps only these on artists and events, and checks a
// Spotify match against the rest of a line-up by cluster. src/lib/taste/knownGenres.test.ts
// holds it to findClusters.
const KNOWN_GENRES_SCRAPE_PATH = path.resolve(APP_ROOT, '../data_collection/known_genres.json');

interface GenreCluster {
	name: string;
	sub_clusters: SubCluster[];
}

interface SubCluster {
	name: string;
	genres?: string[];
	sub_clusters?: SubCluster[]; // For nested structure like Latin music
}

interface GenreClustersData {
	clusters: GenreCluster[];
}

interface UnifiedCategory {
	name: string;
	subgenres: UnifiedSubgenre[];
}

interface UnifiedSubgenre {
	name: string;
	genres: string[];
	subsubgenres?: UnifiedSubSubgenre[];
}

interface UnifiedSubSubgenre {
	name: string;
	genres: string[];
}

interface UnifiedGenresData {
	categories: UnifiedCategory[];
}

const convertToUnifiedFormat = (clustersData: GenreClustersData): UnifiedGenresData => {
	const categories: UnifiedCategory[] = clustersData.clusters.map((cluster) => {
		const subgenres: UnifiedSubgenre[] = cluster.sub_clusters.map((subCluster) => {
			// Check if this subCluster has nested sub_clusters (like Latin music)
			// or direct genres (like most other clusters)

			if (subCluster.sub_clusters && subCluster.sub_clusters.length > 0) {
				// Nested structure: sub_clusters contain more sub_clusters with genres
				// Map these to subsubgenres
				const subsubgenres: UnifiedSubSubgenre[] = subCluster.sub_clusters.map((nestedCluster) => ({
					name: nestedCluster.name,
					genres: nestedCluster.genres || []
				}));

				// Collect all genres from nested clusters for preview
				const allGenres = subCluster.sub_clusters.flatMap((nc) => nc.genres || []);
				const previewGenres = allGenres.slice(0, 3);

				return {
					name: subCluster.name,
					genres: previewGenres,
					subsubgenres
				};
			} else {
				// Flat structure: genres are directly in the subCluster
				const genresList = subCluster.genres || [];
				const previewGenres = genresList.slice(0, 3);

				return {
					name: subCluster.name,
					genres: previewGenres,
					// Create a single subsubgenre group containing all the specific genres
					subsubgenres: [
						{
							name: subCluster.name,
							genres: genresList
						}
					]
				};
			}
		});

		return {
			name: cluster.name,
			subgenres
		};
	});

	return { categories };
};

/**
 * The flat suggestion list (KNOWN_ISSUES 91): every genre a picker may offer, and nothing the
 * server would refuse.
 *
 * What goes in:
 *   - every leaf genre of the tree;
 *   - every sub-cluster name that actually holds leaves (the matcher indexes those as genres,
 *     e.g. "Minimal and Techno"), but not the mid-level grouping names that only organise the
 *     tree ("Ambient and Atmospheric Electronic Music"), which the matcher cannot place and
 *     which were being offered and then refused;
 *   - the umbrella terms (`UMBRELLA_FAMILIES`): "house", "rock", "hip hop" and friends are what
 *     people actually type, the matcher has always accepted them, and until now no picker
 *     offered them (found on the 2026-11-18 device run).
 *
 * What stays out: `UNSCORED_GENRES`, which resolve to Uncategorized on purpose.
 */
const buildSuggestions = (clustersData: GenreClustersData): string[] => {
	const suggestions = new Map<string, string>(); // normalised -> display form

	const add = (name: string | undefined) => {
		if (!name) return;
		const normalised = normalizeForComparison(name);
		if (!normalised || UNSCORED_GENRE_SET.has(normalised)) return;
		// First writer wins, so a leaf's own spelling beats a later duplicate
		if (!suggestions.has(normalised)) suggestions.set(normalised, name.trim());
	};

	const walk = (subCluster: SubCluster) => {
		const nested = subCluster.sub_clusters ?? [];
		const leaves = subCluster.genres ?? [];
		// A sub-cluster name is only a genre to the matcher when it holds leaves itself
		if (leaves.length > 0) add(subCluster.name);
		leaves.forEach(add);
		nested.forEach(walk);
	};

	clustersData.clusters.forEach((cluster) => cluster.sub_clusters.forEach(walk));
	Object.keys(UMBRELLA_FAMILIES).forEach((umbrella) => add(titleCase(umbrella)));

	return [...suggestions.values()].sort((a, b) => a.localeCompare(b));
};

/**
 * Every name the matcher resolves without guessing, mapped to its top-level cluster: the
 * leaves (their CANONICAL_HOMES entry when contested, else the first sub-cluster in file
 * order, as the matcher's index does), the sub-cluster names that hold leaves, the umbrella
 * terms, and every alias, mapped to what it resolves to. UNSCORED genres stay out.
 */
const buildKnownGenres = (clustersData: GenreClustersData): Record<string, string> => {
	const known = new Map<string, string>(); // normalised -> top-level cluster

	const add = (name: string | undefined, cluster: string) => {
		if (!name) return;
		const normalised = normalizeForComparison(name);
		if (!normalised || UNSCORED_GENRE_SET.has(normalised) || known.has(normalised)) return;
		known.set(normalised, CANONICAL_HOMES[normalised]?.cluster ?? cluster);
	};

	const walk = (cluster: string, subCluster: SubCluster) => {
		const leaves = subCluster.genres ?? [];
		if (leaves.length > 0) add(subCluster.name, cluster);
		leaves.forEach((leaf) => add(leaf, cluster));
		(subCluster.sub_clusters ?? []).forEach((nested) => walk(cluster, nested));
	};
	// Umbrellas first: a key here shadows a leaf of the same name on purpose (genreAliases.ts)
	Object.entries(UMBRELLA_FAMILIES).forEach(([umbrella, family]) => add(umbrella, family.cluster));
	clustersData.clusters.forEach((cluster) =>
		cluster.sub_clusters.forEach((subCluster) => walk(cluster.name, subCluster))
	);
	Object.keys(GENRE_ALIASES).forEach((alias) => {
		const target = known.get(normalizeForComparison(resolveAlias(normalizeForComparison(alias))));
		if (target) add(alias, target);
	});

	return Object.fromEntries([...known.entries()].sort(([a], [b]) => a.localeCompare(b)));
};

/** `normalizeGenre` from $lib/server/genreMatching, which scripts cannot import ($lib alias). */
const normalizeForComparison = (genre: string): string =>
	genre
		.toLowerCase()
		.trim()
		.replace(/\s*&\s*/g, ' and ')
		.replace(/\s*\/\s*/g, ' / ')
		.replace(/'/g, '')
		.replace(/\s+/g, ' ');

const titleCase = (value: string): string =>
	value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

const main = () => {
	console.log('Converting genreClusters.json to unified-genres.json format...\n');

	// Load genreClusters.json
	if (!fs.existsSync(GENRE_CLUSTERS_PATH)) {
		console.error(`Error: genreClusters.json not found at ${GENRE_CLUSTERS_PATH}`);
		process.exit(1);
	}

	const clustersContent = fs.readFileSync(GENRE_CLUSTERS_PATH, 'utf8');
	const clustersData: GenreClustersData = JSON.parse(clustersContent);

	console.log(`Loaded ${clustersData.clusters.length} clusters from genreClusters.json`);

	// Convert to unified format
	const unifiedData = convertToUnifiedFormat(clustersData);

	console.log(`Converted to ${unifiedData.categories.length} categories\n`);

	// Write to web location
	const unifiedContent = JSON.stringify(unifiedData, null, '\t');
	fs.writeFileSync(UNIFIED_GENRES_WEB_PATH, unifiedContent, 'utf8');
	console.log(`✓ Written to ${UNIFIED_GENRES_WEB_PATH}`);

	// Write to mobile app location
	if (fs.existsSync(path.dirname(UNIFIED_GENRES_MOBILE_PATH))) {
		fs.writeFileSync(UNIFIED_GENRES_MOBILE_PATH, unifiedContent, 'utf8');
		console.log(`✓ Written to ${UNIFIED_GENRES_MOBILE_PATH}`);
	} else {
		console.log(`⚠ Mobile app directory not found, skipping ${UNIFIED_GENRES_MOBILE_PATH}`);
	}

	// The flat suggestion list, for every picker on the web and in the app
	const suggestions = buildSuggestions(clustersData);
	const suggestionsContent = JSON.stringify({ genres: suggestions }, null, '\t');
	fs.writeFileSync(SUGGESTIONS_WEB_PATH, suggestionsContent, 'utf8');
	console.log(`✓ Written ${suggestions.length} suggestions to ${SUGGESTIONS_WEB_PATH}`);
	if (fs.existsSync(path.dirname(SUGGESTIONS_MOBILE_PATH))) {
		fs.writeFileSync(SUGGESTIONS_MOBILE_PATH, suggestionsContent, 'utf8');
		console.log(`✓ Written to ${SUGGESTIONS_MOBILE_PATH}`);
	}

	// The scrape's copy: name -> top-level cluster (KNOWN_ISSUES 94)
	const knownGenres = buildKnownGenres(clustersData);
	if (fs.existsSync(path.dirname(KNOWN_GENRES_SCRAPE_PATH))) {
		fs.writeFileSync(
			KNOWN_GENRES_SCRAPE_PATH,
			JSON.stringify({ genres: knownGenres }, null, '\t') + '\n',
			'utf8'
		);
		console.log(
			`✓ Written ${Object.keys(knownGenres).length} known genres to ${KNOWN_GENRES_SCRAPE_PATH}`
		);
	}

	console.log('\n✓ Conversion complete!');
	console.log('\nGenre categories:');
	unifiedData.categories.forEach((cat, i) => {
		console.log(`  ${i + 1}. ${cat.name} (${cat.subgenres.length} subgenres)`);
	});
};

main();
