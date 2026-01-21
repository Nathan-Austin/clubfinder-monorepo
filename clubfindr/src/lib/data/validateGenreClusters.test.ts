import { describe, it, expect } from 'vitest';
import { validateGenreClusters } from './genreClusterValidator';
import genreClustersData from './genreClusters.json';

describe('genreClusters.json validation', () => {
	it('validates the actual genreClusters.json file', () => {
		const result = validateGenreClusters(genreClustersData);

		// Log any warnings for review
		if (result.warnings.length > 0) {
			console.warn('Validation warnings for genreClusters.json:');
			result.warnings.forEach((w) => {
				console.warn(`  ${w.path}: ${w.message}`);
			});
		}

		// Log statistics
		console.log(`genreClusters.json statistics:
  - ${result.stats.totalClusters} main clusters
  - ${result.stats.totalSubClusters} sub-clusters
  - ${result.stats.totalGenres} total genres
  - Max nesting depth: ${result.stats.maxDepth}`);

		// Must be valid
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);

		// Basic sanity checks
		expect(result.stats.totalClusters).toBeGreaterThan(0);
		expect(result.stats.totalGenres).toBeGreaterThan(0);
	});
});
