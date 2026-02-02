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

	console.log('\n✓ Conversion complete!');
	console.log('\nGenre categories:');
	unifiedData.categories.forEach((cat, i) => {
		console.log(`  ${i + 1}. ${cat.name} (${cat.subgenres.length} subgenres)`);
	});
};

main();
