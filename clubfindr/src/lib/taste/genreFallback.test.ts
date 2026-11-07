import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtistDetails } from './favouriteArtists';
import { resolveGenresWithFallback, withGenreFallback } from './genreFallback';
import {
	fetchMusicbrainzTags,
	MUSICBRAINZ_USER_AGENT,
	MusicbrainzError,
	parseMusicbrainzTags,
	pickMusicbrainzArtist,
	resetMusicbrainzRateLimit
} from './musicbrainz';

/** Only the tags the real classifier would know; keeps these tests off the cluster data. */
const classify = (tag: string) =>
	['deep house', 'minimal', 'dub techno', 'ambient', 'techno'].includes(tag);

function artist(overrides: Partial<ArtistDetails> = {}): ArtistDetails {
	return {
		source: 'spotify',
		sourceId: 'devNoGenresAtAll000001',
		name: 'Unlabelled Static',
		genres: [],
		imageUrl: null,
		...overrides
	};
}

/** A fetch that answers one JSON body and records the requests it got. */
function fakeFetch(handler: (url: string, init?: RequestInit) => [number, unknown]) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const impl = (async (url: string, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		const [status, body] = handler(String(url), init);
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	}) as unknown as typeof fetch;
	return { impl, calls };
}

const lastfmTags = (tags: [string, number][]) => ({
	toptags: { tag: tags.map(([name, count]) => ({ name, count })) }
});
const mbArtists = (artists: unknown[]) => ({ artists });

// Never actually wait a second in the tests
const mbTestOptions = { sleep: async () => {}, now: () => 0 };

beforeEach(() => resetMusicbrainzRateLimit());

describe('parseMusicbrainzTags', () => {
	it('reads name and count, skipping entries without a name', () => {
		expect(
			parseMusicbrainzTags({
				tags: [
					{ name: 'techno', count: 3 },
					{ name: '  ', count: 9 },
					{ name: 'minimal' },
					{ count: 2 },
					null
				]
			})
		).toEqual([
			{ name: 'techno', count: 3 },
			{ name: 'minimal', count: 0 }
		]);
	});

	it('is empty for an artist without tags', () => {
		expect(parseMusicbrainzTags({})).toEqual([]);
		expect(parseMusicbrainzTags(null)).toEqual([]);
	});
});

describe('pickMusicbrainzArtist', () => {
	it('prefers an exact name match over a higher-scoring one', () => {
		const payload = mbArtists([
			{ name: 'Unlabelled Static Trio', score: 100 },
			{ name: 'unlabelled static', score: 70 }
		]);
		expect(pickMusicbrainzArtist(payload, 'Unlabelled Static')).toMatchObject({ score: 70 });
	});

	it('falls back to the first (highest scoring) entry, and to null when there are none', () => {
		expect(pickMusicbrainzArtist(mbArtists([{ name: 'Some Band' }]), 'Other')).toMatchObject({
			name: 'Some Band'
		});
		expect(pickMusicbrainzArtist(mbArtists([]), 'Other')).toBeNull();
		expect(pickMusicbrainzArtist({}, 'Other')).toBeNull();
	});
});

describe('fetchMusicbrainzTags', () => {
	it('sends a quoted artist query, json format and a descriptive User-Agent', async () => {
		const { impl, calls } = fakeFetch(() => [
			200,
			mbArtists([{ name: 'Unlabelled Static', tags: [{ name: 'techno', count: 2 }] }])
		]);
		const tags = await fetchMusicbrainzTags('Unlabelled Static', {
			...mbTestOptions,
			fetch: impl,
			apiBase: 'http://mb.test'
		});
		expect(tags).toEqual([{ name: 'techno', count: 2 }]);
		const url = new URL(calls[0].url);
		expect(url.origin + url.pathname).toBe('http://mb.test/ws/2/artist');
		expect(url.searchParams.get('query')).toBe('artist:"Unlabelled Static"');
		expect(url.searchParams.get('fmt')).toBe('json');
		const headers = calls[0].init?.headers as Record<string, string>;
		expect(headers['User-Agent']).toBe(MUSICBRAINZ_USER_AGENT);
	});

	it('returns no tags for an unknown artist and for a blank name', async () => {
		const { impl } = fakeFetch(() => [200, mbArtists([])]);
		expect(await fetchMusicbrainzTags('Nobody', { ...mbTestOptions, fetch: impl })).toEqual([]);
		const { impl: unused, calls } = fakeFetch(() => [200, mbArtists([])]);
		expect(await fetchMusicbrainzTags('   ', { ...mbTestOptions, fetch: unused })).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it('reports a 503 as rate limiting and other failures as 502', async () => {
		const { impl: limited } = fakeFetch(() => [503, {}]);
		await expect(
			fetchMusicbrainzTags('A', { ...mbTestOptions, fetch: limited })
		).rejects.toMatchObject({ status: 429 });

		const { impl: broken } = fakeFetch(() => [500, {}]);
		await expect(
			fetchMusicbrainzTags('A', { ...mbTestOptions, fetch: broken })
		).rejects.toBeInstanceOf(MusicbrainzError);
	});

	it('reports an unreachable host as a 502 rather than letting fetch reject', async () => {
		const impl = (async () => {
			throw new TypeError('connect ECONNREFUSED');
		}) as unknown as typeof fetch;
		await expect(
			fetchMusicbrainzTags('A', { ...mbTestOptions, fetch: impl })
		).rejects.toMatchObject({ status: 502, name: 'MusicbrainzError' });
	});

	it('waits out the one-request-a-second limit between calls', async () => {
		const slept: number[] = [];
		let clock = 0;
		const { impl } = fakeFetch(() => [200, mbArtists([])]);
		const options = {
			fetch: impl,
			now: () => clock,
			sleep: async (ms: number) => {
				slept.push(ms);
				clock += ms;
			}
		};
		await fetchMusicbrainzTags('A', options);
		expect(slept).toEqual([]); // first call is free
		await fetchMusicbrainzTags('B', options);
		expect(slept).toEqual([1000]);
	});
});

describe('resolveGenresWithFallback', () => {
	const lastfm = { apiKey: 'k', apiBase: 'http://lastfm.test' };

	it("keeps the provider's own genres and asks nobody", async () => {
		const { impl, calls } = fakeFetch(() => [200, {}]);
		const result = await resolveGenresWithFallback(artist({ genres: ['deep house'] }), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: { ...mbTestOptions, fetch: impl }
		});
		expect(result).toEqual({ genres: ['deep house'], source: 'provider' });
		expect(calls).toHaveLength(0);
	});

	it('falls back to Last.fm top tags, strongest first and noise dropped', async () => {
		const { impl, calls } = fakeFetch(() => [
			200,
			lastfmTags([
				['seen live', 100],
				['dub techno', 80],
				['deep house', 90],
				['not a genre', 70],
				['minimal', 5] // below Last.fm's MIN_TAG_COUNT
			])
		]);
		const result = await resolveGenresWithFallback(artist(), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: null
		});
		expect(result).toEqual({ genres: ['deep house', 'dub techno'], source: 'lastfm' });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toContain('artist.gettoptags');
	});

	it('goes on to MusicBrainz when Last.fm knows the artist but has no usable tag', async () => {
		const { impl, calls } = fakeFetch((url) =>
			url.includes('lastfm.test')
				? [200, lastfmTags([['seen live', 100]])]
				: [200, mbArtists([{ name: 'Unlabelled Static', tags: [{ name: 'ambient', count: 1 }] }])]
		);
		const result = await resolveGenresWithFallback(artist(), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: { ...mbTestOptions, fetch: impl, apiBase: 'http://mb.test' }
		});
		// MusicBrainz counts are raw votes: a single vote still counts
		expect(result).toEqual({ genres: ['ambient'], source: 'musicbrainz' });
		expect(calls.map((c) => new URL(c.url).host)).toEqual(['lastfm.test', 'mb.test']);
	});

	it('goes on to MusicBrainz when Last.fm fails, and logs it', async () => {
		const warn = vi.fn();
		const { impl } = fakeFetch((url) =>
			url.includes('lastfm.test')
				? [500, { error: 16, message: 'temporary failure' }]
				: [200, mbArtists([{ name: 'Unlabelled Static', tags: [{ name: 'techno', count: 2 }] }])]
		);
		const result = await resolveGenresWithFallback(artist(), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: { ...mbTestOptions, fetch: impl, apiBase: 'http://mb.test' },
			warn
		});
		expect(result).toEqual({ genres: ['techno'], source: 'musicbrainz' });
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain('Last.fm genre fallback failed');
	});

	it('skips Last.fm entirely when no key is configured', async () => {
		const { impl, calls } = fakeFetch(() => [
			200,
			mbArtists([{ name: 'Unlabelled Static', tags: [{ name: 'techno', count: 1 }] }])
		]);
		const result = await resolveGenresWithFallback(artist(), {
			classify,
			lastfm: null,
			musicbrainz: { ...mbTestOptions, fetch: impl, apiBase: 'http://mb.test' }
		});
		expect(result.source).toBe('musicbrainz');
		expect(calls.map((c) => new URL(c.url).host)).toEqual(['mb.test']);
	});

	it('gives up quietly when neither provider has anything', async () => {
		const warn = vi.fn();
		const { impl } = fakeFetch((url) =>
			url.includes('lastfm.test') ? [200, lastfmTags([])] : [200, mbArtists([])]
		);
		const result = await resolveGenresWithFallback(artist(), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: { ...mbTestOptions, fetch: impl, apiBase: 'http://mb.test' },
			warn
		});
		expect(result).toEqual({ genres: [], source: 'none' });
		expect(warn).not.toHaveBeenCalled();
	});

	it('gives up when both providers are down, without throwing', async () => {
		const warn = vi.fn();
		const { impl } = fakeFetch(() => [500, {}]);
		const result = await resolveGenresWithFallback(artist(), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: { ...mbTestOptions, fetch: impl, apiBase: 'http://mb.test' },
			warn
		});
		expect(result).toEqual({ genres: [], source: 'none' });
		expect(warn).toHaveBeenCalledTimes(2);
	});

	it('honours the genre limit', async () => {
		const { impl } = fakeFetch(() => [
			200,
			lastfmTags([
				['deep house', 100],
				['minimal', 90],
				['techno', 80]
			])
		]);
		const result = await resolveGenresWithFallback(artist(), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: null,
			limit: 2
		});
		expect(result.genres).toEqual(['deep house', 'minimal']);
	});
});

describe('withGenreFallback', () => {
	const lastfm = { apiKey: 'k', apiBase: 'http://lastfm.test' };

	it('fills in genres for an artist the provider had none for', async () => {
		const { impl } = fakeFetch(() => [200, lastfmTags([['dub techno', 100]])]);
		const lookup = withGenreFallback(async () => artist(), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: null
		});
		expect(await lookup('spotify', 'devNoGenresAtAll000001')).toMatchObject({
			name: 'Unlabelled Static',
			genres: ['dub techno']
		});
	});

	it('passes an artist that already has genres straight through', async () => {
		const { impl, calls } = fakeFetch(() => [200, {}]);
		const lookup = withGenreFallback(async () => artist({ genres: ['minimal'] }), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: { ...mbTestOptions, fetch: impl }
		});
		expect((await lookup('spotify', 'x')).genres).toEqual(['minimal']);
		expect(calls).toHaveLength(0);
	});

	it('leaves the artist untouched when the fallback finds nothing', async () => {
		const { impl } = fakeFetch(() => [200, lastfmTags([['seen live', 100]])]);
		const lookup = withGenreFallback(async () => artist(), {
			classify,
			lastfm: { ...lastfm, fetch: impl },
			musicbrainz: null
		});
		expect((await lookup('spotify', 'x')).genres).toEqual([]);
	});

	it('still propagates a provider failure: the fallback only adds genres', async () => {
		const lookup = withGenreFallback(
			async () => {
				throw new Error('Spotify does not know this artist');
			},
			{ classify, lastfm: null, musicbrainz: null }
		);
		await expect(lookup('spotify', 'x')).rejects.toThrow('does not know this artist');
	});
});
