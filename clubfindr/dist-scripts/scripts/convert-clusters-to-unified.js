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
import { UMBRELLA_FAMILIES, UNSCORED_GENRE_SET } from '../src/lib/data/genreAliases.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve APP_ROOT from the script location, accounting for build output in dist-scripts
const APP_ROOT = __dirname.includes('dist-scripts')
    ? path.resolve(__dirname, '../..')
    : path.resolve(__dirname, '..');
const GENRE_CLUSTERS_PATH = path.resolve(APP_ROOT, './src/lib/data/genreClusters.json');
const UNIFIED_GENRES_WEB_PATH = path.resolve(APP_ROOT, './static/lib/unified-genres.json');
const UNIFIED_GENRES_MOBILE_PATH = path.resolve(APP_ROOT, '../app_clubfindr/src/constants/unified-genres.json');
// The one list of genres anything may suggest (KNOWN_ISSUES 91): flat, and exactly what the
// server's isKnownGenre accepts. src/lib/taste/genreSuggestions.test.ts holds the two together.
const SUGGESTIONS_WEB_PATH = path.resolve(APP_ROOT, './static/lib/genre-suggestions.json');
const SUGGESTIONS_MOBILE_PATH = path.resolve(APP_ROOT, '../app_clubfindr/src/constants/genre-suggestions.json');
const convertToUnifiedFormat = (clustersData) => {
    const categories = clustersData.clusters.map((cluster) => {
        const subgenres = cluster.sub_clusters.map((subCluster) => {
            // Check if this subCluster has nested sub_clusters (like Latin music)
            // or direct genres (like most other clusters)
            if (subCluster.sub_clusters && subCluster.sub_clusters.length > 0) {
                // Nested structure: sub_clusters contain more sub_clusters with genres
                // Map these to subsubgenres
                const subsubgenres = subCluster.sub_clusters.map((nestedCluster) => ({
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
            }
            else {
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
const buildSuggestions = (clustersData) => {
    const suggestions = new Map(); // normalised -> display form
    const add = (name) => {
        if (!name)
            return;
        const normalised = normalizeForComparison(name);
        if (!normalised || UNSCORED_GENRE_SET.has(normalised))
            return;
        // First writer wins, so a leaf's own spelling beats a later duplicate
        if (!suggestions.has(normalised))
            suggestions.set(normalised, name.trim());
    };
    const walk = (subCluster) => {
        const nested = subCluster.sub_clusters ?? [];
        const leaves = subCluster.genres ?? [];
        // A sub-cluster name is only a genre to the matcher when it holds leaves itself
        if (leaves.length > 0)
            add(subCluster.name);
        leaves.forEach(add);
        nested.forEach(walk);
    };
    clustersData.clusters.forEach((cluster) => cluster.sub_clusters.forEach(walk));
    Object.keys(UMBRELLA_FAMILIES).forEach((umbrella) => add(titleCase(umbrella)));
    return [...suggestions.values()].sort((a, b) => a.localeCompare(b));
};
/** `normalizeGenre` from $lib/server/genreMatching, which scripts cannot import ($lib alias). */
const normalizeForComparison = (genre) => genre
    .toLowerCase()
    .trim()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ');
const titleCase = (value) => value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const main = () => {
    console.log('Converting genreClusters.json to unified-genres.json format...\n');
    // Load genreClusters.json
    if (!fs.existsSync(GENRE_CLUSTERS_PATH)) {
        console.error(`Error: genreClusters.json not found at ${GENRE_CLUSTERS_PATH}`);
        process.exit(1);
    }
    const clustersContent = fs.readFileSync(GENRE_CLUSTERS_PATH, 'utf8');
    const clustersData = JSON.parse(clustersContent);
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
    }
    else {
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
    console.log('\n✓ Conversion complete!');
    console.log('\nGenre categories:');
    unifiedData.categories.forEach((cat, i) => {
        console.log(`  ${i + 1}. ${cat.name} (${cat.subgenres.length} subgenres)`);
    });
};
main();
//# sourceMappingURL=convert-clusters-to-unified.js.map