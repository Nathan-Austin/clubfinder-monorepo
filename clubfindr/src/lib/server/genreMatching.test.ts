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

describe('the clusters added on 2026-11-10', () => {
	// Every one of these was Uncategorized or confidently wrong before the Pop, "Soul, Funk and
	// Disco", Jazz, "African Popular Music", Classical and "Folk and Singer-Songwriter" clusters
	// existed.
	it.each([
		['pop', 'Pop', 'Mainstream Pop'],
		['k-pop', 'Pop', 'Global Pop'],
		['schlager', 'Pop', 'European Pop'],
		['soul', 'Soul, Funk and Disco', 'Classic Soul'],
		['funk', 'Soul, Funk and Disco', 'Funk'],
		['disco', 'Soul, Funk and Disco', 'Disco'],
		['nu disco', 'Soul, Funk and Disco', 'Disco'],
		['gospel', 'Soul, Funk and Disco', 'Gospel and Spiritual'],
		['jazz', 'Jazz', 'Traditional Jazz'],
		['bebop', 'Jazz', 'Bebop and Modern Jazz'],
		['afrobeats', 'African Popular Music', 'West African Pop'],
		['highlife', 'African Popular Music', 'West African Pop'],
		['classical', 'Classical', 'Orchestral and Chamber'],
		['folk', 'Folk and Singer-Songwriter', 'Folk']
	])('places %s in %s / %s at full weight', (genre, cluster, subCluster) => {
		expect(homeOf(genre)).toEqual({ cluster, subCluster, weight: 1.0 });
	});

	it('moves R&B out of Hip-Hop/Rap and in with soul', () => {
		expect(homeOf('r&b')).toEqual({
			cluster: 'Soul, Funk and Disco',
			subCluster: 'Contemporary R&B',
			weight: 1.0
		});
		expect(homeOf('rnb')).toEqual(homeOf('r&b'));
	});

	it('matches a soul fan to a venue that plays motown', () => {
		const { similarity } = calculateClusterSimilarity(
			findClusters(['soul']),
			findClusters(['motown'])
		);
		expect(similarity).toBe(1);
	});

	it('keeps disco apart from disco house', () => {
		// "Disco House" is a house leaf and stays one; a disco night is not a house night.
		expect(homeOf('disco house').cluster).toBe('Electronic/Dance (EDM)');
		const { similarity } = calculateClusterSimilarity(
			findClusters(['disco']),
			findClusters(['disco house'])
		);
		expect(similarity).toBe(0);
	});
});

describe('the single rock tree', () => {
	// "Rock Music" and "Alternative Rock and Punk" described the same music, so they split the
	// rock audience in half: a leaf unique to one tree scored 0 against its counterpart in the
	// other. The alternative tree was folded in on 2026-11-10.
	it('no longer has an Alternative Rock and Punk cluster', () => {
		for (const genre of ['punk', 'emo', 'shoegaze', 'grunge', 'post-punk', 'new wave']) {
			expect(homeOf(genre).cluster).not.toBe('Alternative Rock and Punk');
		}
	});

	it('matches an emo fan to a post-hardcore venue', () => {
		// `emo` was in the alternative tree only and `post-hardcore` resolved to Rock Music, so
		// these two scored nothing against each other.
		const { similarity } = calculateClusterSimilarity(
			findClusters(['emo']),
			findClusters(['post-hardcore'])
		);
		expect(similarity).toBe(1);
	});

	it('matches a goth night to a darkwave one', () => {
		expect(homeOf('darkwave')).toEqual({
			cluster: 'Rock Music',
			subCluster: 'Gothic and Wave',
			weight: 1.0
		});
		const { similarity } = calculateClusterSimilarity(
			findClusters(['goth']),
			findClusters(['deathrock', 'coldwave'])
		);
		expect(similarity).toBe(1);
	});

	it('matches a bare "indie" to indie rock and shoegaze', () => {
		const { similarity } = calculateClusterSimilarity(
			findClusters(['indie']),
			findClusters(['indie rock', 'shoegaze'])
		);
		expect(similarity).toBe(1);
	});

	it('reads "indie pop" as the Indie Pop cluster, not as rock', () => {
		expect(homeOf('indie pop').cluster).toBe('Indie Pop');
	});

	it('keeps the leaves that belonged in another cluster all along', () => {
		expect(homeOf('cowpunk').cluster).toBe('Country');
		expect(homeOf('industrial rock').cluster).toBe('Industrial');
		expect(homeOf('bedroom pop').cluster).toBe('Indie Pop');
		expect(homeOf('psych folk').cluster).toBe('Neo-Psychedelia');
		expect(homeOf('anti-folk').cluster).toBe('Folk and Singer-Songwriter');
		expect(homeOf('gothic metal').subCluster).toBe('Heavy Metal');
	});
});

describe('genres with nowhere to go', () => {
	it('leaves a tag that is merely too broad Uncategorized', () => {
		for (const genre of ['electronic', 'dance', 'club music', 'various']) {
			expect(homeOf(genre).cluster).toBe('Uncategorized');
		}
	});

	it('does not let two Uncategorized genres match each other', () => {
		const { similarity } = calculateClusterSimilarity(
			findClusters(['electronic']),
			findClusters(['various'])
		);
		expect(similarity).toBe(0);
	});

	it('reports a genre no cluster knows to missing-genres.txt', async () => {
		const fs = await import('node:fs');
		findClusters(['zzzz-no-such-genre-41287']);
		expect(vi.mocked(fs.appendFileSync)).toHaveBeenCalledWith(
			expect.stringContaining('missing-genres.txt'),
			'zzzz-no-such-genre-41287\n',
			'utf8'
		);
	});

	it('does not report a tag that is merely too broad', async () => {
		const fs = await import('node:fs');
		findClusters(['club music']);
		expect(vi.mocked(fs.appendFileSync)).not.toHaveBeenCalled();
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
