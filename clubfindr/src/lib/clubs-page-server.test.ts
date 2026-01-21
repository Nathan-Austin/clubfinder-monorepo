import { describe, it, expect } from 'vitest';
import {
	_calculateClusterSimilarity,
	_findClusters,
	_normalizeGenre,
	_createClusterCacheKey,
	_genreToClusterIndex
} from '../routes/clubs/+page.server';
import { isGenreMatch, jaccardSimilarity, makeClusterId } from './genreSimilarity';

describe('makeClusterId', () => {
	it('is deterministic for the same inputs', () => {
		const first = makeClusterId('rock', 'indie');
		const second = makeClusterId('rock', 'indie');
		expect(first).toBe(second);
	});

	it('does not collide across boundaries', () => {
		const first = makeClusterId('ab', 'c');
		const second = makeClusterId('a', 'bc');
		expect(first).not.toBe(second);
	});

	it('keeps parts distinct even when they contain separators', () => {
		const first = makeClusterId('rock::metal', 'dance');
		const second = makeClusterId('rock', 'metal::dance');
		expect(first).not.toBe(second);
	});
});

describe('jaccardSimilarity', () => {
	it('returns 1 for identical sets', () => {
		const setA = new Set<string>(['a', 'b']);
		const setB = new Set<string>(['a', 'b']);
		expect(jaccardSimilarity(setA, setB)).toBe(1);
	});

	it('uses set semantics for overlap and union', () => {
		const setA = new Set<string>(['a', 'a', 'b']);
		const setB = new Set<string>(['b', 'b', 'c']);
		expect(jaccardSimilarity(setA, setB)).toBeCloseTo(1 / 3, 5);
	});

	it('returns 0 for empty sets', () => {
		const setA = new Set<string>();
		const setB = new Set<string>();
		expect(jaccardSimilarity(setA, setB)).toBe(0);
	});
});

describe('isGenreMatch', () => {
	it('does not allow substring matches without word boundaries', () => {
		expect(isGenreMatch('tech', 'techno')).toBe(false);
		expect(isGenreMatch('house', 'warehouse')).toBe(false);
	});

	it('matches word-boundary phrases but not embedded words', () => {
		expect(isGenreMatch('house', 'house music')).toBe(true);
		expect(isGenreMatch('house', 'warehouse')).toBe(false);
	});

	it('keeps exact matches working', () => {
		expect(isGenreMatch('techno', 'techno')).toBe(true);
	});

	it('allows small typos via fuzzy matching', () => {
		expect(isGenreMatch('techno', 'tekno')).toBe(true);
	});
});

describe('_findClusters', () => {
	it('returns one cluster entry for a genre that appears in multiple clusters', () => {
		const clusters = _findClusters(['ambient dub']);
		expect(clusters.length).toBe(1);
		expect(clusters[0]?.genre).toBe('ambient dub');
		expect(clusters[0]?.weight).toBe(1.0);
	});
});

describe('_genreToClusterIndex', () => {
	it('indexes normalized genres with cluster mappings', () => {
		const key = _normalizeGenre('Deep Drum & Bass');
		const entries = _genreToClusterIndex.get(key);
		expect(entries?.length).toBeGreaterThan(0);
		expect(entries?.[0]).toEqual(
			expect.objectContaining({
				cluster: 'Electronic/Dance (EDM)',
				subCluster: 'Drum & Bass'
			})
		);
	});

	it('stores multiple entries for genres that appear in multiple clusters', () => {
		const key = _normalizeGenre('ambient dub');
		const entries = _genreToClusterIndex.get(key);
		expect(entries?.length).toBeGreaterThan(1);
	});
});

describe('_calculateClusterSimilarity', () => {
	it('dedupes matchingGenres', () => {
		const userClusters = [
			{ genre: 'ambient', cluster: 'Test Cluster', subCluster: 'Test Sub', weight: 1.0 },
			{ genre: 'ambient', cluster: 'Test Cluster', subCluster: 'Test Sub', weight: 1.0 }
		];
		const clubClusters = [
			{ genre: 'ambient', cluster: 'Test Cluster', subCluster: 'Test Sub', weight: 1.0 }
		];

		const { matchingGenres } = _calculateClusterSimilarity(userClusters, clubClusters);
		expect(matchingGenres).toEqual(['ambient']);
	});

	it('scores exact matches higher than fuzzy matches', () => {
		const exactScore = _calculateClusterSimilarity(
			[
				{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 1.0 },
				{ genre: 'b', cluster: 'Other', subCluster: 'Other', weight: 1.0 }
			],
			[{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 1.0 }]
		).similarity;

		const fuzzyScore = _calculateClusterSimilarity(
			[
				{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 0.8 },
				{ genre: 'b', cluster: 'Other', subCluster: 'Other', weight: 1.0 }
			],
			[{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 0.8 }]
		).similarity;

		expect(exactScore).toBeGreaterThan(fuzzyScore);
	});

	it('scores fuzzy matches higher than partial matches', () => {
		const fuzzyScore = _calculateClusterSimilarity(
			[
				{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 0.8 },
				{ genre: 'b', cluster: 'Other', subCluster: 'Other', weight: 1.0 }
			],
			[{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 0.8 }]
		).similarity;

		const partialScore = _calculateClusterSimilarity(
			[
				{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 0.6 },
				{ genre: 'b', cluster: 'Other', subCluster: 'Other', weight: 1.0 }
			],
			[{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 0.6 }]
		).similarity;

		expect(fuzzyScore).toBeGreaterThan(partialScore);
	});

	it('returns 1 for identical weighted sets', () => {
		const result = _calculateClusterSimilarity(
			[
				{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 1.0 },
				{ genre: 'b', cluster: 'Other', subCluster: 'Other', weight: 0.8 }
			],
			[
				{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 1.0 },
				{ genre: 'b', cluster: 'Other', subCluster: 'Other', weight: 0.8 }
			]
		);

		expect(result.similarity).toBeCloseTo(1, 5);
	});

	it('returns 0 for no overlap', () => {
		const result = _calculateClusterSimilarity(
			[{ genre: 'a', cluster: 'Cluster', subCluster: 'Sub', weight: 1.0 }],
			[{ genre: 'b', cluster: 'Other', subCluster: 'Other', weight: 1.0 }]
		);

		expect(result.similarity).toBe(0);
	});
});

describe('_normalizeGenre', () => {
	it('replaces ampersands with "and" and matches', () => {
		const normalized = _normalizeGenre('Drum & Bass');
		expect(normalized).toBe('drum and bass');
		expect(isGenreMatch(normalized, _normalizeGenre('Deep Drum & Bass'))).toBe(true);
	});

	it('preserves slashes as delimiters and matches', () => {
		const normalized = _normalizeGenre('Hip Hop/Rap');
		expect(normalized).toBe('hip hop / rap');
		expect(isGenreMatch(normalized, _normalizeGenre('Hip-Hop/Rap'))).toBe(true);
	});

	it('preserves slash spacing for acid/jazz', () => {
		expect(_normalizeGenre('acid/jazz')).toBe('acid / jazz');
	});
});

describe('_createClusterCacheKey', () => {
	it('creates consistent keys for identical arrays', () => {
		const key1 = _createClusterCacheKey(['techno', 'house']);
		const key2 = _createClusterCacheKey(['techno', 'house']);
		expect(key1).toBe(key2);
	});

	it('creates same key regardless of genre order', () => {
		const key1 = _createClusterCacheKey(['techno', 'house', 'trance']);
		const key2 = _createClusterCacheKey(['house', 'trance', 'techno']);
		const key3 = _createClusterCacheKey(['trance', 'techno', 'house']);
		expect(key1).toBe(key2);
		expect(key2).toBe(key3);
	});

	it('creates different keys for different genre sets', () => {
		const key1 = _createClusterCacheKey(['techno', 'house']);
		const key2 = _createClusterCacheKey(['techno', 'trance']);
		expect(key1).not.toBe(key2);
	});

	it('handles empty arrays', () => {
		const key1 = _createClusterCacheKey([]);
		const key2 = _createClusterCacheKey([]);
		expect(key1).toBe(key2);
		expect(key1).toBe('[]');
	});

	it('handles single genre', () => {
		const key = _createClusterCacheKey(['techno']);
		expect(key).toBe('["techno"]');
	});
});
