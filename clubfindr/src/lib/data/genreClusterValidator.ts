/**
 * Validation utilities for genreClusters.json
 * Ensures the genre cluster data structure is valid and complete
 */

export interface GenreSubCluster {
	name: string;
	genres?: string[];
	sub_clusters?: GenreSubCluster[];
}

export interface GenreCluster {
	name: string;
	genres?: string[];
	sub_clusters: GenreSubCluster[];
}

export interface GenreClustersData {
	clusters: GenreCluster[];
}

export interface ValidationError {
	path: string;
	message: string;
	severity: 'error' | 'warning';
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationError[];
	stats: {
		totalClusters: number;
		totalSubClusters: number;
		totalGenres: number;
		maxDepth: number;
	};
}

/**
 * Validates the structure of a genre clusters JSON object
 */
export function validateGenreClusters(data: unknown): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: ValidationError[] = [];
	const stats = {
		totalClusters: 0,
		totalSubClusters: 0,
		totalGenres: 0,
		maxDepth: 0
	};

	// Check if data exists
	if (!data) {
		errors.push({
			path: 'root',
			message: 'Genre clusters data is null or undefined',
			severity: 'error'
		});
		return { valid: false, errors, warnings, stats };
	}

	// Check if data is an object
	if (typeof data !== 'object') {
		errors.push({
			path: 'root',
			message: `Expected object, got ${typeof data}`,
			severity: 'error'
		});
		return { valid: false, errors, warnings, stats };
	}

	const clusterData = data as Record<string, unknown>;

	// Check for clusters array
	if (!('clusters' in clusterData)) {
		errors.push({
			path: 'root',
			message: 'Missing required "clusters" property',
			severity: 'error'
		});
		return { valid: false, errors, warnings, stats };
	}

	if (!Array.isArray(clusterData.clusters)) {
		errors.push({
			path: 'clusters',
			message: `Expected array, got ${typeof clusterData.clusters}`,
			severity: 'error'
		});
		return { valid: false, errors, warnings, stats };
	}

	const clusters = clusterData.clusters;

	if (clusters.length === 0) {
		warnings.push({
			path: 'clusters',
			message: 'Clusters array is empty',
			severity: 'warning'
		});
	}

	stats.totalClusters = clusters.length;

	// Validate each cluster
	clusters.forEach((cluster, index) => {
		validateCluster(cluster, `clusters[${index}]`, errors, warnings, stats, 0);
	});

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		stats
	};
}

function validateCluster(
	cluster: unknown,
	path: string,
	errors: ValidationError[],
	warnings: ValidationError[],
	stats: { totalSubClusters: number; totalGenres: number; maxDepth: number },
	depth: number
): void {
	stats.maxDepth = Math.max(stats.maxDepth, depth);

	if (!cluster || typeof cluster !== 'object') {
		errors.push({
			path,
			message: `Expected object, got ${typeof cluster}`,
			severity: 'error'
		});
		return;
	}

	const clusterObj = cluster as Record<string, unknown>;

	// Validate name
	if (!('name' in clusterObj)) {
		errors.push({
			path,
			message: 'Missing required "name" property',
			severity: 'error'
		});
	} else if (typeof clusterObj.name !== 'string') {
		errors.push({
			path: `${path}.name`,
			message: `Expected string, got ${typeof clusterObj.name}`,
			severity: 'error'
		});
	} else if (clusterObj.name.trim() === '') {
		errors.push({
			path: `${path}.name`,
			message: 'Name cannot be empty',
			severity: 'error'
		});
	}

	// Validate genres (optional)
	if ('genres' in clusterObj) {
		if (!Array.isArray(clusterObj.genres)) {
			errors.push({
				path: `${path}.genres`,
				message: `Expected array, got ${typeof clusterObj.genres}`,
				severity: 'error'
			});
		} else {
			const genres = clusterObj.genres;
			genres.forEach((genre, genreIndex) => {
				if (typeof genre !== 'string') {
					errors.push({
						path: `${path}.genres[${genreIndex}]`,
						message: `Expected string, got ${typeof genre}`,
						severity: 'error'
					});
				} else if (genre.trim() === '') {
					warnings.push({
						path: `${path}.genres[${genreIndex}]`,
						message: 'Genre name is empty',
						severity: 'warning'
					});
				} else {
					stats.totalGenres++;
				}
			});

			// Check for duplicate genres within the same cluster
			const uniqueGenres = new Set(genres.filter((g) => typeof g === 'string'));
			if (uniqueGenres.size < genres.length) {
				warnings.push({
					path: `${path}.genres`,
					message: 'Contains duplicate genre names',
					severity: 'warning'
				});
			}
		}
	}

	// Validate sub_clusters (required for main clusters, optional for nested)
	if ('sub_clusters' in clusterObj) {
		if (!Array.isArray(clusterObj.sub_clusters)) {
			errors.push({
				path: `${path}.sub_clusters`,
				message: `Expected array, got ${typeof clusterObj.sub_clusters}`,
				severity: 'error'
			});
		} else {
			const subClusters = clusterObj.sub_clusters;

			if (subClusters.length === 0) {
				warnings.push({
					path: `${path}.sub_clusters`,
					message: 'Sub-clusters array is empty',
					severity: 'warning'
				});
			}

			subClusters.forEach((subCluster, subIndex) => {
				stats.totalSubClusters++;
				validateCluster(
					subCluster,
					`${path}.sub_clusters[${subIndex}]`,
					errors,
					warnings,
					stats,
					depth + 1
				);
			});
		}
	} else if (depth === 0) {
		// Main clusters should have sub_clusters
		errors.push({
			path,
			message: 'Main cluster missing required "sub_clusters" property',
			severity: 'error'
		});
	} else if (!('genres' in clusterObj)) {
		// Nested sub-clusters without further nesting should have genres
		warnings.push({
			path,
			message: 'Sub-cluster has neither "genres" nor "sub_clusters"',
			severity: 'warning'
		});
	}
}

/**
 * Validates and loads genre clusters data with helpful error messages
 */
export function validateAndLoad(data: unknown): GenreClustersData {
	const result = validateGenreClusters(data);

	if (!result.valid) {
		const errorMessages = result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
		throw new Error(`Genre clusters validation failed:\n${errorMessages}`);
	}

	if (result.warnings.length > 0) {
		const warningMessages = result.warnings.map((w) => `  ${w.path}: ${w.message}`).join('\n');
		console.warn(`Genre clusters validation warnings:\n${warningMessages}`);
	}

	console.log(`Genre clusters loaded successfully:
  - ${result.stats.totalClusters} main clusters
  - ${result.stats.totalSubClusters} sub-clusters
  - ${result.stats.totalGenres} total genres
  - Max nesting depth: ${result.stats.maxDepth}`);

	return data as GenreClustersData;
}
