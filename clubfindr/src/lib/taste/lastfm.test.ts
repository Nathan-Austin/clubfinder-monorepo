import { describe, expect, it, vi } from 'vitest';
import {
	fetchTopArtists,
	fetchTopTags,
	importLastfmUser,
	isValidLastfmUsername,
	LastfmError,
	MIN_TAG_COUNT,
	parseTopArtists,
	parseTopTags,
	tagsToGenres,
	type LastfmTag
} from './lastfm';
import { isKnownGenre } from './genreClassifier';
import type { Queryable } from './favouriteArtists';

const USER = '00000000-0000-4000-8000-000000000001';
const options = { apiKey: 'test-key' };

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const TOP_ARTISTS = {
	topartists: {
		artist: [
			{
				name: 'Velvet Meridian',
				mbid: '',
				url: 'https://www.last.fm/music/Velvet+Meridian',
				playcount: '120',
				image: [
					{ '#text': 'https://img.example/small.png', size: 'small' },
					{ '#text': 'https://img.example/large.png', size: 'large' }
				]
			},
			{ name: 'Juno Paperplane', mbid: 'mbid-juno', url: '', playcount: '80', image: [] },
			{ name: 'Unlabelled Static', playcount: '10' }
		]
	}
};

const TAGS: Record<string, LastfmTag[]> = {
	'Velvet Meridian': [
		{ name: 'seen live', count: 100 },
		{ name: 'Disco', count: 90 },
		{ name: 'nu disco', count: 60 },
		{ name: 'velvet meridian', count: 50 },
		{ name: 'italo disco', count: 40 },
		{ name: 'synthpop', count: 5 }
	],
	'Juno Paperplane': [{ name: 'deep house', count: 100 }],
	'Unlabelled Static': [
		{ name: 'seen live', count: 100 },
		{ name: 'favourites', count: 50 }
	]
};

/** A fetch that speaks just enough Last.fm. */
function mockLastfm(overrides: Partial<Record<string, (url: URL) => Response>> = {}) {
	return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
		const url = new URL(String(input));
		expect(url.pathname).toBe('/2.0/');
		expect(url.searchParams.get('api_key')).toBe('test-key');
		expect(url.searchParams.get('format')).toBe('json');
		const method = url.searchParams.get('method') ?? '';
		const override = overrides[method];
		if (override) return override(url);
		if (method === 'user.gettopartists') return jsonResponse(TOP_ARTISTS);
		if (method === 'artist.gettoptags') {
			const artist = url.searchParams.get('artist') ?? '';
			return jsonResponse({
				toptags: { tag: (TAGS[artist] ?? []).map((t) => ({ ...t, count: String(t.count) })) }
			});
		}
		return jsonResponse({ error: 3, message: 'Invalid Method' }, 400);
	}) as unknown as typeof fetch;
}

/** Everything the classifier would accept in these tests. */
const classify = (tag: string) =>
	['disco', 'nu disco', 'italo disco', 'deep house', 'synthpop'].includes(tag);

describe('isValidLastfmUsername', () => {
	it('follows the Last.fm rules', () => {
		expect(isValidLastfmUsername('fanatic')).toBe(true);
		expect(isValidLastfmUsername('a_b-c9')).toBe(true);
		expect(isValidLastfmUsername('9lives')).toBe(false);
		expect(isValidLastfmUsername('x')).toBe(false);
		expect(isValidLastfmUsername('sixteen_chars_xx')).toBe(false);
		expect(isValidLastfmUsername('has space')).toBe(false);
		expect(isValidLastfmUsername(undefined)).toBe(false);
	});
});

describe('parsing', () => {
	it('reads top artists, preferring the large image', () => {
		const artists = parseTopArtists(TOP_ARTISTS);
		expect(artists).toHaveLength(3);
		expect(artists[0]).toEqual({
			name: 'Velvet Meridian',
			mbid: null,
			url: 'https://www.last.fm/music/Velvet+Meridian',
			imageUrl: 'https://img.example/large.png',
			playcount: 120
		});
		expect(artists[1].mbid).toBe('mbid-juno');
		expect(artists[2]).toMatchObject({ imageUrl: null, url: null, playcount: 10 });
	});

	it('copes with a single artist or tag not wrapped in an array, and with nothing', () => {
		expect(parseTopArtists({ topartists: { artist: { name: 'Solo' } } })).toHaveLength(1);
		expect(parseTopTags({ toptags: { tag: { name: 'techno', count: '100' } } })).toEqual([
			{ name: 'techno', count: 100 }
		]);
		expect(parseTopArtists({})).toEqual([]);
		expect(parseTopTags(null)).toEqual([]);
	});
});

describe('tagsToGenres', () => {
	it('keeps strong, recognised tags in strength order, minus noise and the artist name', () => {
		expect(tagsToGenres(TAGS['Velvet Meridian'], 'Velvet Meridian', classify)).toEqual([
			'disco',
			'nu disco',
			'italo disco'
		]);
	});

	it('drops weak tags even when recognised', () => {
		const weak = [{ name: 'disco', count: MIN_TAG_COUNT - 1 }];
		expect(tagsToGenres(weak, 'X', classify)).toEqual([]);
	});

	it('caps the number of genres', () => {
		const many = ['disco', 'nu disco', 'italo disco', 'deep house', 'synthpop'].map((name, i) => ({
			name,
			count: 100 - i
		}));
		expect(tagsToGenres(many, 'X', classify, 2)).toEqual(['disco', 'nu disco']);
	});

	it('returns nothing when the classifier knows none of the tags', () => {
		expect(tagsToGenres(TAGS['Unlabelled Static'], 'Unlabelled Static', classify)).toEqual([]);
	});
});

describe('isKnownGenre (the /clubs classifier)', () => {
	it('accepts genres the clusters know and rejects Last.fm noise', () => {
		expect(isKnownGenre('techno')).toBe(true);
		expect(isKnownGenre('deep house')).toBe(true);
		expect(isKnownGenre('seen live')).toBe(false);
		expect(isKnownGenre('under 2000 listeners')).toBe(false);
		expect(isKnownGenre('zzzz-not-a-genre-00001')).toBe(false);
	});
});

describe('fetchTopArtists / fetchTopTags', () => {
	it('sends the right parameters', async () => {
		const fetch = mockLastfm();
		const artists = await fetchTopArtists('fanatic', { ...options, fetch }, '6month', 7);
		expect(artists).toHaveLength(3);
		const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
		expect(url.origin).toBe('https://ws.audioscrobbler.com');
		expect(url.searchParams.get('user')).toBe('fanatic');
		expect(url.searchParams.get('period')).toBe('6month');
		expect(url.searchParams.get('limit')).toBe('7');

		const tags = await fetchTopTags('Juno Paperplane', { ...options, fetch });
		expect(tags).toEqual([{ name: 'deep house', count: 100 }]);
	});

	it('honours an overridden host', async () => {
		const localFetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			expect(String(input).startsWith('http://127.0.0.1:4176/2.0/?')).toBe(true);
			return jsonResponse(TOP_ARTISTS);
		}) as unknown as typeof fetch;
		await fetchTopArtists('fanatic', {
			...options,
			fetch: localFetch,
			apiBase: 'http://127.0.0.1:4176'
		});
		expect(localFetch).toHaveBeenCalledTimes(1);
	});

	it('maps Last.fm errors to clear messages', async () => {
		const unknownUser = mockLastfm({
			'user.gettopartists': () => jsonResponse({ error: 6, message: 'User not found' }, 404)
		});
		await expect(
			fetchTopArtists('nobody', { ...options, fetch: unknownUser })
		).rejects.toMatchObject({
			code: 'unknown-user',
			status: 404,
			message: expect.stringContaining('"nobody"')
		});

		const rateLimited = mockLastfm({
			'user.gettopartists': () => jsonResponse({ error: 29, message: 'Rate limit exceeded' }, 429)
		});
		await expect(
			fetchTopArtists('fanatic', { ...options, fetch: rateLimited })
		).rejects.toMatchObject({ code: 'rate-limited', status: 429 });

		// Last.fm sometimes returns errors with HTTP 200
		const badKey = mockLastfm({
			'user.gettopartists': () => jsonResponse({ error: 10, message: 'Invalid API key' })
		});
		await expect(fetchTopArtists('fanatic', { ...options, fetch: badKey })).rejects.toMatchObject({
			code: 'invalid-key',
			status: 502
		});

		const down = mockLastfm({
			'user.gettopartists': () => new Response('<html>502</html>', { status: 502 })
		});
		await expect(fetchTopArtists('fanatic', { ...options, fetch: down })).rejects.toMatchObject({
			code: 'unavailable',
			status: 502
		});

		const offline = vi.fn(async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		await expect(fetchTopArtists('fanatic', { ...options, fetch: offline })).rejects.toBeInstanceOf(
			LastfmError
		);
	});
});

/** In-memory stand-in for the two taste tables. */
function fakeTasteDb(existingFavourites: string[] = [], catalogueOnly: string[] = []) {
	const catalogue = new Map<string, Record<string, unknown>>();
	const favourites = new Set<string>();
	let nextId = 1;
	for (const name of [...existingFavourites, ...catalogueOnly]) {
		const id = `fav-${nextId++}`;
		catalogue.set(id, {
			id,
			source: 'spotify',
			source_id: name,
			name,
			genres: ['deep house'],
			image_url: null,
			fetched_at: new Date()
		});
		if (existingFavourites.includes(name)) favourites.add(id);
	}
	const db: Queryable = {
		async query(text, params = []) {
			if (text.includes('FROM clubfindr.user_favourite_artists f')) {
				return { rows: [...favourites].map((id) => catalogue.get(id)!), rowCount: favourites.size };
			}
			if (text.includes('WHERE lower(name) = lower($1)')) {
				const [name] = params as [string];
				const row = [...catalogue.values()].find(
					(r) => String(r.name).toLowerCase() === name.toLowerCase()
				);
				return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
			}
			if (text.includes('UPDATE clubfindr.taste_artists SET genres')) {
				const [id, genres] = params as [string, string[]];
				const row = catalogue.get(id)!;
				row.genres = genres;
				return { rows: [row], rowCount: 1 };
			}
			if (text.includes('INSERT INTO clubfindr.taste_artists')) {
				const [source, sourceId, name, genres, imageUrl] = params as [
					string,
					string,
					string,
					string[],
					string | null
				];
				let row = [...catalogue.values()].find(
					(r) => r.source === source && r.source_id === sourceId
				);
				if (!row) {
					row = { id: `art-${nextId++}`, source, source_id: sourceId };
					catalogue.set(String(row.id), row);
				}
				Object.assign(row, { name, genres, image_url: imageUrl, fetched_at: new Date() });
				return { rows: [row], rowCount: 1 };
			}
			if (text.includes('INSERT INTO clubfindr.user_favourite_artists')) {
				const [, artistId, limit] = params as [string, string, number];
				if (favourites.has(artistId) || favourites.size >= limit) return { rows: [], rowCount: 0 };
				favourites.add(artistId);
				return { rows: [{ artist_id: artistId }], rowCount: 1 };
			}
			if (text.includes('SELECT 1 FROM clubfindr.user_favourite_artists')) {
				const [, artistId] = params as [string, string];
				return favourites.has(artistId) ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
			}
			throw new Error(`fakeTasteDb: unexpected query ${text}`);
		}
	};
	return { db, favourites, catalogue };
}

describe('importLastfmUser', () => {
	it('imports new artists with classified genres, skips existing ones, reports the rest', async () => {
		const { db, favourites } = fakeTasteDb(['Juno Paperplane']);
		const fetch = mockLastfm();
		const result = await importLastfmUser(
			db,
			USER,
			'fanatic',
			{ ...options, fetch },
			{
				classify,
				concurrency: 1
			}
		);

		expect(result.found).toBe(3);
		expect(result.imported.map((i) => [i.artist.name, i.artist.genres, i.created])).toEqual([
			['Velvet Meridian', ['disco', 'nu disco', 'italo disco'], true],
			['Unlabelled Static', [], true]
		]);
		expect(result.imported[0].artist).toMatchObject({
			source: 'lastfm',
			sourceId: 'Velvet Meridian',
			imageUrl: 'https://img.example/large.png'
		});
		expect(result.skipped).toEqual([{ name: 'Juno Paperplane', reason: 'already a favourite' }]);
		expect(result.withoutGenres).toEqual(['Unlabelled Static']);
		expect(result.genres).toEqual(['deep house', 'disco', 'italo disco', 'nu disco']);
		expect(result.warning).toBeUndefined();
		expect(favourites.size).toBe(3);
		// One request for the top artists, one per imported artist for tags, none for the skipped one
		expect(vi.mocked(fetch).mock.calls).toHaveLength(3);
	});

	it('reuses a catalogue row of the same name from another provider', async () => {
		// Velvet Meridian is already catalogued from Spotify (nobody's favourite): the import
		// links that row instead of creating a Last.fm twin, and keeps its genres
		const { db, catalogue } = fakeTasteDb([], ['Velvet Meridian']);
		const result = await importLastfmUser(
			db,
			USER,
			'fanatic',
			{ ...options, fetch: mockLastfm() },
			{
				classify,
				concurrency: 1
			}
		);
		const velvet = result.imported.find((i) => i.artist.name === 'Velvet Meridian')!;
		expect(velvet.created).toBe(true);
		expect(velvet.artist.source).toBe('spotify');
		expect(velvet.artist.genres).toEqual(['deep house']);
		expect([...catalogue.values()].filter((r) => r.name === 'Velvet Meridian')).toHaveLength(1);
	});

	it('stops at the favourites cap', async () => {
		const { db } = fakeTasteDb(Array.from({ length: 49 }, (_, i) => `Existing ${i}`));
		const result = await importLastfmUser(
			db,
			USER,
			'fanatic',
			{ ...options, fetch: mockLastfm() },
			{
				classify,
				concurrency: 1
			}
		);
		expect(result.imported.map((i) => i.artist.name)).toEqual(['Velvet Meridian']);
		expect(result.skipped.filter((s) => s.reason === 'limit reached').map((s) => s.name)).toEqual([
			'Juno Paperplane',
			'Unlabelled Static'
		]);
	});

	it('keeps what it got when the tag requests hit the rate limit', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let tagCalls = 0;
		const fetch = mockLastfm({
			'artist.gettoptags': (url) => {
				tagCalls += 1;
				if (tagCalls > 1) return jsonResponse({ error: 29, message: 'Rate limit exceeded' }, 429);
				const artist = url.searchParams.get('artist') ?? '';
				return jsonResponse({ toptags: { tag: TAGS[artist] ?? [] } });
			}
		});
		const { db } = fakeTasteDb();
		const result = await importLastfmUser(
			db,
			USER,
			'fanatic',
			{ ...options, fetch },
			{
				classify,
				concurrency: 1
			}
		);
		expect(result.imported.map((i) => i.artist.name)).toEqual(['Velvet Meridian']);
		expect(result.skipped.map((s) => s.reason)).toEqual(['tags unavailable', 'tags unavailable']);
		expect(result.warning).toContain('limiting');
		// After the first 429 no further tag requests were made
		expect(tagCalls).toBe(2);
		warn.mockRestore();
	});

	it('fails as a whole when the user is unknown', async () => {
		const fetch = mockLastfm({
			'user.gettopartists': () => jsonResponse({ error: 6, message: 'User not found' }, 404)
		});
		const { db, favourites } = fakeTasteDb();
		await expect(
			importLastfmUser(db, USER, 'nobody', { ...options, fetch }, { classify })
		).rejects.toMatchObject({ code: 'unknown-user' });
		expect(favourites.size).toBe(0);
	});
});
