import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read genreClusters.json
const genreClustersPath = path.join(__dirname, '../src/lib/data/genreClusters.json');
const genreClusters = JSON.parse(fs.readFileSync(genreClustersPath, 'utf8'));

const missingGenresCache = new Set();

function normalizeGenre(genre) {
	return genre
		.toLowerCase()
		.trim()
		.replace(/\s*\/\s*/g, ' ') // Replace slashes with spaces
		.replace(/-/g, ' ') // Replace hyphens with spaces
		.replace(/[&']/g, '') // Remove & and '
		.replace(/\s+/g, ' '); // Normalize spaces
}

function shouldIgnoreGenre(genre) {
	const ignoredGenres = ['none', 'soft porn', 'vaa', 'idiotic']; // Removed 'new', 'the' for now, or make them strict
	// For 'new' and 'the', we probably only want to ignore them if they are the ENTIRE string, or maybe not at all?
	// "The" is rarely a genre. "New" is definitely part of "New Wave".
	// Let's just match exact strings for these common words if we really need to ignore them.
	return ignoredGenres.some((ignored) => genre.toLowerCase() === ignored.toLowerCase());
}

function findClusters(genres) {
	const clusters = [];

	// Normalize input to an array of genres
	const genreList = Array.isArray(genres) ? genres : Object.keys(genres);

	// Extract significant genres
	const significantGenres = genreList
		.map((genre) => genre.toLowerCase().trim())
		.filter((genre) => genre.length >= 2 && !shouldIgnoreGenre(genre));

	const matchGenreInSubClusters = (subClusters, genre, clusterName) => {
		const normalizedInputGenre = normalizeGenre(genre);

		// Skip processing for ignored genres
		if (shouldIgnoreGenre(normalizedInputGenre)) {
			return null;
		}

		for (const subCluster of subClusters) {
			const normalizedSubGenres = subCluster.genres?.map((g) => normalizeGenre(g)) || [];

			if (
				normalizedSubGenres.some(
					(g) => g === normalizedInputGenre
					// Broad matching removed for testing
					// || (g.includes('house') && normalizedInputGenre.includes('house')) ||
					// (g.includes('techno') && normalizedInputGenre.includes('techno'))
				)
			) {
				return {
					genre,
					cluster: clusterName,
					subCluster: subCluster.name
				};
			}

			// Recursively search in nested sub_clusters
			if (subCluster.sub_clusters) {
				const nestedResult = matchGenreInSubClusters(subCluster.sub_clusters, genre, clusterName);
				if (nestedResult) return nestedResult;
			}
		}
		return null;
	};

	significantGenres.forEach((genre) => {
		let clusterMatch = null;

		genreClusters.clusters.forEach((cluster) => {
			const match = matchGenreInSubClusters(cluster.sub_clusters, genre, cluster.name);
			if (match) {
				clusterMatch = match;
				clusters.push(match);
			}
		});

		if (!clusterMatch && !missingGenresCache.has(genre)) {
			console.warn(`Genre "${genre}" not found in any cluster`);
			missingGenresCache.add(genre);
		}
	});

	return clusters;
}

// Test Data
const testGenres = [
	// Direct matches
	'Deep House',
	'Techno',
	'Drum & Bass',

	// Loose matches (should match due to 'house'/'techno' logic)
	'Deep Tech House',
	'Minimal Techno',
	'Tech House',
	'Funky House',
	'Ghetto House', // might not be in list but has 'House'

	// Tricky ones
	'Post-Punk',
	'New Wave',
	'Indie Pop',
	'Lo-Fi Beats', // might match Lo-Fi

	// Potentially missing
	'Hyperpop',
	'Phonk',
	'UK Garage',
	'Dubstep',
	'Riddim',

	// Unknowns / Edge cases
	'Folktronica', // In JSON?
	'Witch House', // In JSON?
	'Vaporwave',
	'Abstract Hip Hop',

	// Weird formatting
	'Deep-House',
	'Tech/House',
	'R&B', // normalizeGenre removes &
	"Rock 'n' Roll"
];

console.log('Running Cluster Analysis...');
const results = {};

testGenres.forEach((g) => {
	const res = findClusters([g]);
	results[g] = res.map((r) => `${r.cluster} -> ${r.subCluster}`).join(', ') || 'MISSING';
});

console.table(results);
