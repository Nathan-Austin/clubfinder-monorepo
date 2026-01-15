import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
const currentModule = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === currentModule;

// Path constants
const FULL_GENRE_LIST_PATH = path.resolve('./src/lib/data/full_genre_list.csv');
const GENRE_CLUSTERS_PATH = path.resolve('./src/lib/data/genreClusters.json');
const BLACKLIST_PATH = path.resolve('./src/lib/data/genre-blacklist.txt');
const PROCESSED_GENRES_PATH = path.resolve('./src/lib/data/processed_genres.json');

// Load genre blacklist
const loadBlacklist = (): Set<string> => {
	try {
		if (fs.existsSync(BLACKLIST_PATH)) {
			const blacklistContent = fs.readFileSync(BLACKLIST_PATH, 'utf8');
			return new Set(
				blacklistContent
					.split('\n')
					.map((line) => line.trim().toLowerCase())
					.filter((line) => line && !line.startsWith('#'))
			);
		} else {
			// Create default blacklist if it doesn't exist
			const defaultBlacklist = [
				'none',
				'soft porn',
				'idiotic',
				'vaa'
				// Add other terms you want to blacklist
			].join('\n');

			fs.writeFileSync(BLACKLIST_PATH, defaultBlacklist);
			return new Set(defaultBlacklist.split('\n'));
		}
	} catch (error) {
		console.error('Error loading blacklist:', error);
		return new Set();
	}
};

// Load full genre list
const loadFullGenreList = (): string[] => {
	try {
		if (!fs.existsSync(FULL_GENRE_LIST_PATH)) {
			console.error(`Full genre list not found at ${FULL_GENRE_LIST_PATH}`);
			return [];
		}

		const csvContent = fs.readFileSync(FULL_GENRE_LIST_PATH, 'utf8');
		const records = parse(csvContent, {
			columns: true,
			skip_empty_lines: true
		});

		// Assuming the CSV has a 'genre' column
		return records
			.map((record: { genre?: string }) => record.genre?.trim().toLowerCase())
			.filter(Boolean);
	} catch (error) {
		console.error('Error loading full genre list:', error);
		return [];
	}
};

// Load genre clusters
const loadGenreClusters = () => {
	try {
		const clustersContent = fs.readFileSync(GENRE_CLUSTERS_PATH, 'utf8');
		return JSON.parse(clustersContent);
	} catch (error) {
		console.error('Error loading genre clusters:', error);
		return { clusters: [] };
	}
};

// Load already processed genres to avoid reprocessing
const loadProcessedGenres = (): Set<string> => {
	try {
		if (fs.existsSync(PROCESSED_GENRES_PATH)) {
			const processedContent = fs.readFileSync(PROCESSED_GENRES_PATH, 'utf8');
			return new Set(JSON.parse(processedContent));
		}
		return new Set();
	} catch (error) {
		console.error('Error loading processed genres:', error);
		return new Set();
	}
};

// Save processed genres
const saveProcessedGenres = (processedGenres: Set<string>) => {
	try {
		fs.writeFileSync(PROCESSED_GENRES_PATH, JSON.stringify(Array.from(processedGenres), null, 2));
	} catch (error) {
		console.error('Error saving processed genres:', error);
	}
};

// Normalize genre for consistent matching
const normalizeGenre = (genre: string): string => {
	return genre
		.toLowerCase()
		.trim()
		.replace(/\s*\/\s*/g, ' ') // Replace slashes with spaces
		.replace(/[&']/g, '') // Remove & and '
		.replace(/\s+/g, ' '); // Normalize spaces
};

// Find best matching cluster for a genre using similarity
interface GenreCluster {
	name: string;
	sub_clusters: SubCluster[];
}

interface SubCluster {
	name: string;
	genres?: string[];
	sub_clusters?: SubCluster[];
}

interface GenreClusters {
	clusters: GenreCluster[];
}

const findBestClusterMatch = (
	genre: string,
	genreClusters: GenreClusters
): { cluster: string; subCluster: string; confidence: number } | null => {
	let bestMatch = { cluster: '', subCluster: '', confidence: 0 };
	const normalizedGenre = normalizeGenre(genre);

	// Helper function to calculate string similarity (0-1)
	const calculateSimilarity = (str1: string, str2: string): number => {
		const longer = str1.length > str2.length ? str1 : str2;
		const shorter = str1.length > str2.length ? str2 : str1;

		if (longer.length === 0) return 1.0;
		if (longer.includes(shorter)) return 0.9;

		// Count matching characters
		let matches = 0;
		for (let i = 0; i < shorter.length; i++) {
			if (longer.includes(shorter[i])) matches++;
		}

		return matches / longer.length;
	};

	const checkSubClusters = (subClusters: SubCluster[], clusterName: string) => {
		for (const subCluster of subClusters) {
			// Check direct matches first
			if (subCluster.genres && Array.isArray(subCluster.genres)) {
				for (const clusterGenre of subCluster.genres) {
					const normalizedClusterGenre = normalizeGenre(clusterGenre);

					// Exact match
					if (normalizedClusterGenre === normalizedGenre) {
						return { cluster: clusterName, subCluster: subCluster.name, confidence: 1.0 };
					}

					// Similarity match
					const similarity = calculateSimilarity(normalizedClusterGenre, normalizedGenre);
					if (similarity > bestMatch.confidence) {
						bestMatch = {
							cluster: clusterName,
							subCluster: subCluster.name,
							confidence: similarity
						};
					}
				}
			}

			// Recursively check nested subclusters
			if (subCluster.sub_clusters) {
				const nestedMatch = checkSubClusters(subCluster.sub_clusters, clusterName);
				if (nestedMatch && nestedMatch.confidence > bestMatch.confidence) {
					bestMatch = nestedMatch;
				}
			}
		}

		return bestMatch.confidence > 0 ? bestMatch : null;
	};

	// Check each main cluster
	for (const cluster of genreClusters.clusters) {
		const match = checkSubClusters(cluster.sub_clusters, cluster.name);
		if (match && match.confidence > bestMatch.confidence) {
			bestMatch = match;
		}
	}

	return bestMatch.confidence > 0.6 ? bestMatch : null; // Only return if confidence is high enough
};

// Update genre clusters with new genres
const updateGenreClusters = (
	genreClusters: GenreClusters,
	newGenres: { genre: string; cluster: string; subCluster: string }[]
): boolean => {
	let updated = false;

	for (const { genre, cluster, subCluster } of newGenres) {
		// Find the cluster
		const clusterObj = genreClusters.clusters.find((c) => c.name === cluster);
		if (!clusterObj) continue;

		// Helper function to find and update the subcluster
		const updateSubCluster = (subClusters: SubCluster[]): boolean => {
			for (const sc of subClusters) {
				if (sc.name === subCluster) {
					// Initialize genres array if it doesn't exist
					if (!sc.genres) sc.genres = [];

					// Add the genre if it's not already there
					if (!sc.genres.includes(genre)) {
						sc.genres.push(genre);
						updated = true;
						return true;
					}
					return false;
				}

				// Check nested subclusters
				if (sc.sub_clusters && updateSubCluster(sc.sub_clusters)) {
					return true;
				}
			}
			return false;
		};

		updateSubCluster(clusterObj.sub_clusters);
	}

	return updated;
};

// Main function to process and update genres
export const processGenres = async () => {
	// Load necessary data
	const blacklist = loadBlacklist();
	const fullGenreList = loadFullGenreList();
	const genreClusters = loadGenreClusters();
	const processedGenres = loadProcessedGenres();

	// Filter genres
	const filteredGenres = fullGenreList.filter((genre) => {
		// Skip blacklisted genres
		if (blacklist.has(genre.toLowerCase())) return false;

		// Skip already processed genres
		if (processedGenres.has(genre)) return false;

		return true;
	});

	console.log(`Processing ${filteredGenres.length} new genres...`);

	// Match genres to clusters
	const genresToAdd: { genre: string; cluster: string; subCluster: string }[] = [];
	const unmatchedGenres: string[] = [];

	for (const genre of filteredGenres) {
		const match = findBestClusterMatch(genre, genreClusters);

		if (match && match.confidence >= 0.6) {
			genresToAdd.push({
				genre,
				cluster: match.cluster,
				subCluster: match.subCluster
			});
			processedGenres.add(genre);
		} else {
			unmatchedGenres.push(genre);
		}
	}

	// Report on unmatched genres for manual review
	if (unmatchedGenres.length > 0) {
		const unmatchedPath = path.resolve(
			process.env.APP_ROOT || '.',
			'./src/lib/data/unmatched_genres.txt'
		);
		fs.writeFileSync(unmatchedPath, unmatchedGenres.join('\n'));
		console.log(
			`${unmatchedGenres.length} genres couldn't be matched automatically. See ${unmatchedPath}`
		);
	}

	// Update genre clusters
	if (genresToAdd.length > 0) {
		const updated = updateGenreClusters(genreClusters, genresToAdd);

		if (updated) {
			// Save updated clusters
			fs.writeFileSync(GENRE_CLUSTERS_PATH, JSON.stringify(genreClusters, null, 2));
			console.log(`Updated genre clusters with ${genresToAdd.length} new genres`);
		}
	}

	// Save processed genres list
	saveProcessedGenres(processedGenres);

	return {
		processed: genresToAdd.length,
		unmatched: unmatchedGenres.length,
		total: filteredGenres.length
	};
};

// CLI interface
if (isMainModule) {
	// code that runs when file is executed directly
	processGenres()
		.then((result) => {
			console.log('Genre processing complete:');
			console.log(`- Processed: ${result.processed}`);
			console.log(`- Unmatched: ${result.unmatched}`);
			console.log(`- Total new: ${result.total}`);
		})
		.catch((error) => {
			console.error('Error processing genres:', error);
			process.exit(1);
		});
}

export default {
	processGenres,
	normalizeGenre
};
