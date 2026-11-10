// What the alias layer changed about matching (KNOWN_ISSUES 18). The companion
// `$lib/data/genreAliases.test.ts` checks the tables themselves against genreClusters.json;
// this file pins the behaviour a user or a venue actually sees.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateClusterSimilarity, findClusters } from './genreMatching';

vi.mock('node:fs', () => {
	const appendFileSync = vi.fn();
	return {
		default: { appendFileSync },
		appendFileSync
	};
});

beforeEach(() => {
	vi.clearAllMocks();
});

function homeOf(genre: string) {
	const [entry] = findClusters([genre]);
	return { cluster: entry.cluster, subCluster: entry.subCluster, weight: entry.weight };
}

describe('umbrella genres', () => {
	// These are the tags the providers return most often, and every one of them used to be
	// guessed at or dropped.
	it.each([
		['house', 'Electronic/Dance (EDM)', 'Classic House'],
		['trance', 'Electronic/Dance (EDM)', 'Trance Variants'],
		['edm', 'Electronic/Dance (EDM)', 'Modern House'],
		['hip hop', 'Hip-Hop/Rap', 'East Coast, West Coast, and Midwest'],
		['rock', 'Rock Music', 'Classic Rock'],
		['metal', 'Rock Music', 'Heavy Metal'],
		['reggae', 'Reggae and Roots', 'Roots Reggae Foundations'],
		['blues', 'Blues', 'Post-War Blues'],
		['country', 'Country', 'Traditional and Classic Country'],
		['latin', 'Latin/Latino Music', 'Classic Latin']
	])('places %s in %s / %s at full weight', (genre, cluster, subCluster) => {
		expect(homeOf(genre)).toEqual({ cluster, subCluster, weight: 1.0 });
	});
});

describe('spelling variants', () => {
	it('treats dnb, d&b and drum n bass as drum & bass', () => {
		const expected = homeOf('drum and bass');
		expect(expected.subCluster).toBe('Drum & Bass');
		for (const variant of ['dnb', 'd&b', 'drum n bass', 'DnB']) {
			expect(homeOf(variant)).toEqual(expected);
		}
	});

	it('treats rnb and hip-hop as their canonical spellings', () => {
		expect(homeOf('rnb')).toEqual(homeOf('r&b'));
		expect(homeOf('hip-hop')).toEqual(homeOf('hip hop'));
	});

	it('reads a bare "garage" as UK garage, not garage rock', () => {
		expect(homeOf('garage')).toEqual(homeOf('uk garage'));
	});
});

describe('fuzzy false friends', () => {
	// Each of these was a confident wrong answer before: one edit or one word away, a different
	// kind of music entirely.
	it('no longer reads funk as punk', () => {
		expect(homeOf('funk').cluster).not.toBe('Alternative Rock and Punk');
		expect(homeOf('funk').cluster).not.toBe('Rock Music');
	});

	it('no longer reads hip hop as trip hop', () => {
		expect(homeOf('hip hop').subCluster).not.toBe('Ambient with Rhythmic Elements');
	});

	it('no longer reads dnb as dub', () => {
		expect(homeOf('dnb').cluster).not.toBe('Reggae and Roots');
	});

	it('no longer reads country as a Hip-Hop/Rap sub-cluster', () => {
		expect(homeOf('country').cluster).toBe('Country');
	});

	it('still forgives a genuine typo in a single word', () => {
		expect(homeOf('tekno')).toEqual(
			expect.objectContaining({ cluster: 'Electronic/Dance (EDM)', weight: 0.8 })
		);
	});
});

describe('contested leaves', () => {
	it('resolves a leaf the same way wherever it is asked for', () => {
		// deep house and tech house are both filed under two sub-clusters in genreClusters.json.
		expect(homeOf('deep house').subCluster).toBe('Deep/Tech House');
		expect(homeOf('tech house').subCluster).toBe('Deep/Tech House');
	});

	it('files reggaeton under Urban Latino rather than Reggae', () => {
		expect(homeOf('reggaeton')).toEqual({
			cluster: 'Latin/Latino Music',
			subCluster: 'Reggaeton',
			weight: 1.0
		});
	});

	it('returns a single entry for a leaf with several homes', () => {
		expect(findClusters(['ambient dub'])).toHaveLength(1);
	});
});

describe('genres with nowhere to go', () => {
	it('leaves an unhoused genre Uncategorized instead of guessing', () => {
		// genreClusters.json has no cluster for any of these yet. Uncategorized is dropped from
		// both sides of the similarity, so they carry no weight rather than a wrong one.
		for (const genre of ['pop', 'soul', 'funk', 'jazz', 'disco', 'afrobeats', 'classical']) {
			expect(homeOf(genre).cluster).toBe('Uncategorized');
		}
	});

	it('does not let two unhoused genres match each other', () => {
		const { similarity } = calculateClusterSimilarity(
			findClusters(['jazz']),
			findClusters(['pop'])
		);
		expect(similarity).toBe(0);
	});

	it('still reports an unhoused genre to missing-genres.txt', async () => {
		const fs = await import('node:fs');
		findClusters(['highlife']);
		expect(vi.mocked(fs.appendFileSync)).toHaveBeenCalledWith(
			expect.stringContaining('missing-genres.txt'),
			'highlife\n',
			'utf8'
		);
	});

	it('does not report a tag that is merely too broad', () => {
		const genre = 'club music';
		expect(homeOf(genre).cluster).toBe('Uncategorized');
	});
});

describe('matching through the alias layer', () => {
	it('matches a user who says "house" to a venue that plays acid house', () => {
		const { similarity, matchingGenres } = calculateClusterSimilarity(
			findClusters(['house']),
			findClusters(['acid house'])
		);
		expect(similarity).toBe(1);
		expect(matchingGenres).toEqual(['house']);
	});

	it('does not match a user who says "funk" to a punk venue', () => {
		const { similarity } = calculateClusterSimilarity(
			findClusters(['funk']),
			findClusters(['hardcore punk'])
		);
		expect(similarity).toBe(0);
	});

	it('matches reggaeton to a venue that plays dembow', () => {
		const { similarity } = calculateClusterSimilarity(
			findClusters(['reggaeton']),
			findClusters(['reggaeton', 'dembow'])
		);
		expect(similarity).toBeGreaterThan(0);
	});
});
