import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearTokenCache,
	fetchSpotifyArtist,
	getClientCredentialsToken,
	isSpotifyId,
	makeArtistLookup,
	parseSpotifyArtist,
	searchSpotifyArtists,
	searchSpotifyTracks,
	SpotifyLookupError
} from './spotifyArtistLookup';

const ID = '3aBcDeFgHiJkLmNoPqRsTu';
const credentials = { clientId: 'client-id', clientSecret: 'client-secret' };

const spotifyArtist = {
	id: ID,
	name: ' Juno Paperplane ',
	genres: ['Deep House', 'minimal', 'deep house'],
	images: [
		{ url: 'https://i.scdn.co/640', width: 640, height: 640 },
		{ url: 'https://i.scdn.co/300', width: 300, height: 300 },
		{ url: 'https://i.scdn.co/64', width: 64, height: 64 }
	]
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

/** A fetch mock that answers the token endpoint and the artist endpoint. */
function mockSpotify(
	artistResponse: (url: string) => Response = () => jsonResponse(spotifyArtist),
	tokenResponse: () => Response = () =>
		jsonResponse({ access_token: 'app-token', token_type: 'Bearer', expires_in: 3600 })
) {
	return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url === 'https://accounts.spotify.com/api/token') {
			expect(init?.method).toBe('POST');
			expect(String(init?.headers && (init.headers as Record<string, string>).Authorization)).toBe(
				`Basic ${Buffer.from('client-id:client-secret').toString('base64')}`
			);
			return tokenResponse();
		}
		if (
			url.startsWith('https://api.spotify.com/v1/artists/') ||
			url.startsWith('https://api.spotify.com/v1/search?')
		) {
			expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer app-token');
			return artistResponse(url);
		}
		throw new Error(`unexpected request ${url}`);
	}) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

beforeEach(() => {
	clearTokenCache();
});

describe('isSpotifyId', () => {
	it('accepts 22 base-62 characters only', () => {
		expect(isSpotifyId(ID)).toBe(true);
		expect(isSpotifyId('spotify:artist:' + ID)).toBe(false);
		expect(isSpotifyId('short')).toBe(false);
		expect(isSpotifyId(42)).toBe(false);
	});
});

describe('parseSpotifyArtist', () => {
	it('keeps id, trimmed name, normalised genres and the 300px image', () => {
		expect(parseSpotifyArtist(spotifyArtist)).toEqual({
			source: 'spotify',
			sourceId: ID,
			name: 'Juno Paperplane',
			genres: ['deep house', 'minimal'],
			imageUrl: 'https://i.scdn.co/300'
		});
	});

	// The live API serves 640/320/160, so a hard-coded preference for exactly 300 never matched
	// and the 640 was taken for every artist (KNOWN_ISSUES 21).
	it('takes the smallest image still big enough at the live widths', () => {
		expect(
			parseSpotifyArtist({
				id: ID,
				name: 'Live Widths',
				images: [
					{ url: 'https://i.scdn.co/640', width: 640, height: 640 },
					{ url: 'https://i.scdn.co/320', width: 320, height: 320 },
					{ url: 'https://i.scdn.co/160', width: 160, height: 160 }
				]
			})
		).toMatchObject({ imageUrl: 'https://i.scdn.co/320' });
	});

	it('takes the largest image when every one is too small, whatever the order', () => {
		expect(
			parseSpotifyArtist({
				id: ID,
				name: 'Small',
				images: [
					{ url: 'https://i.scdn.co/64', width: 64, height: 64 },
					{ url: 'https://i.scdn.co/160', width: 160, height: 160 }
				]
			})
		).toMatchObject({ imageUrl: 'https://i.scdn.co/160' });
	});

	it('copes with images that carry no width', () => {
		expect(
			parseSpotifyArtist({
				id: ID,
				name: 'Widthless',
				images: [{ url: 'https://i.scdn.co/unknown' }]
			})
		).toMatchObject({ imageUrl: 'https://i.scdn.co/unknown' });
	});

	it('falls back to the first image and an empty genre list', () => {
		expect(
			parseSpotifyArtist({
				id: ID,
				name: 'X',
				images: [{ url: 'https://i.scdn.co/640', width: 640 }]
			})
		).toMatchObject({ genres: [], imageUrl: 'https://i.scdn.co/640' });
		expect(parseSpotifyArtist({ id: ID, name: 'X' })).toMatchObject({ genres: [], imageUrl: null });
	});

	it('rejects things that are not artists', () => {
		expect(parseSpotifyArtist(null)).toBeNull();
		expect(parseSpotifyArtist({ id: 'bad', name: 'X' })).toBeNull();
		expect(parseSpotifyArtist({ id: ID, name: '   ' })).toBeNull();
	});
});

describe('getClientCredentialsToken', () => {
	it('requests a token once and caches it until shortly before expiry', async () => {
		const fetch = mockSpotify();
		let clock = 1_000_000;
		const now = () => clock;
		await expect(getClientCredentialsToken({ credentials, fetch, now })).resolves.toBe('app-token');
		clock += 3_000 * 1000; // 50 minutes later: still cached (3600 - 60 s margin)
		await getClientCredentialsToken({ credentials, fetch, now });
		expect(fetch).toHaveBeenCalledTimes(1);
		clock += 600 * 1000; // past expiry: refreshed
		await getClientCredentialsToken({ credentials, fetch, now });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('reports a failed token request as a 502', async () => {
		const fetch = mockSpotify(undefined, () => jsonResponse({ error: 'invalid_client' }, 400));
		await expect(getClientCredentialsToken({ credentials, fetch })).rejects.toMatchObject({
			name: 'SpotifyLookupError',
			status: 502
		});
	});
});

describe('fetchSpotifyArtist', () => {
	it('returns the parsed artist', async () => {
		const fetch = mockSpotify();
		const artist = await fetchSpotifyArtist(ID, { credentials, fetch });
		expect(artist.name).toBe('Juno Paperplane');
		expect(artist.genres).toEqual(['deep house', 'minimal']);
		expect(fetch).toHaveBeenCalledTimes(2); // token + artist
		expect(String(fetch.mock.calls[1][0])).toBe(`https://api.spotify.com/v1/artists/${ID}`);
	});

	it('rejects an invalid id before touching the network', async () => {
		const fetch = mockSpotify();
		await expect(fetchSpotifyArtist('nope', { credentials, fetch })).rejects.toMatchObject({
			status: 400
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('maps 404 and other failures to SpotifyLookupError', async () => {
		const missing = mockSpotify(() => jsonResponse({ error: { status: 404 } }, 404));
		await expect(fetchSpotifyArtist(ID, { credentials, fetch: missing })).rejects.toMatchObject({
			status: 404
		});
		clearTokenCache();
		const broken = mockSpotify(() => jsonResponse({ error: { status: 500 } }, 500));
		await expect(fetchSpotifyArtist(ID, { credentials, fetch: broken })).rejects.toMatchObject({
			status: 502
		});
		clearTokenCache();
		const garbage = mockSpotify(() => jsonResponse({ unexpected: true }));
		await expect(fetchSpotifyArtist(ID, { credentials, fetch: garbage })).rejects.toMatchObject({
			status: 502
		});
	});

	it('reports an unreachable host as a 502', async () => {
		const offline = vi.fn(async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		await expect(fetchSpotifyArtist(ID, { credentials, fetch: offline })).rejects.toMatchObject({
			status: 502,
			message: expect.stringContaining('unreachable')
		});
	});
});

describe('makeArtistLookup', () => {
	it('routes spotify lookups and rejects unsupported sources', async () => {
		const fetch = mockSpotify();
		const lookup = makeArtistLookup({ credentials, fetch });
		await expect(lookup('spotify', ID)).resolves.toMatchObject({ sourceId: ID });
		await expect(lookup('lastfm', 'Juno Paperplane')).rejects.toBeInstanceOf(SpotifyLookupError);
	});
});

describe('searchSpotifyArtists', () => {
	it('searches artists by name and parses the items', async () => {
		const fetch = mockSpotify((url) => {
			const params = new URL(url).searchParams;
			expect(params.get('q')).toBe('juno');
			expect(params.get('type')).toBe('artist');
			expect(params.get('limit')).toBe('10');
			return jsonResponse({
				artists: {
					items: [spotifyArtist, { id: 'bad' }, { ...spotifyArtist, id: '4aBcDeFgHiJkLmNoPqRsTu' }]
				}
			});
		});
		const hits = await searchSpotifyArtists(' juno ', { credentials, fetch });
		expect(hits.map((h) => h.sourceId)).toEqual([ID, '4aBcDeFgHiJkLmNoPqRsTu']);
	});

	it('returns nothing for an empty query without a request', async () => {
		const fetch = mockSpotify();
		await expect(searchSpotifyArtists('  ', { credentials, fetch })).resolves.toEqual([]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('honours overridden hosts', async () => {
		const localFetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const url = String(input);
			if (url === 'http://127.0.0.1:4175/api/token') {
				return jsonResponse({ access_token: 'app-token', expires_in: 3600 });
			}
			expect(url.startsWith('http://127.0.0.1:4175/v1/search?')).toBe(true);
			return jsonResponse({ artists: { items: [spotifyArtist] } });
		}) as unknown as typeof fetch;
		const hits = await searchSpotifyArtists('juno', {
			credentials,
			fetch: localFetch,
			apiBase: 'http://127.0.0.1:4175',
			accountsBase: 'http://127.0.0.1:4175'
		});
		expect(hits).toHaveLength(1);
	});

	it('maps failures to a 502', async () => {
		const fetch = mockSpotify(() => jsonResponse({ error: 'rate limited' }, 429));
		await expect(searchSpotifyArtists('juno', { credentials, fetch })).rejects.toMatchObject({
			status: 502
		});
	});
});

describe('searchSpotifyTracks', () => {
	const track = {
		id: '5aBcDeFgHiJkLmNoPqRsTu',
		name: ' Paper Planes at Dawn ',
		artists: [{ name: 'Juno Paperplane' }, { name: '' }, {}],
		album: { name: 'Folds' },
		duration_ms: 312000,
		preview_url: null
	};

	it('searches tracks with the app token and parses the items', async () => {
		const fetch = mockSpotify((url) => {
			const params = new URL(url).searchParams;
			expect(params.get('q')).toBe('paper');
			expect(params.get('type')).toBe('track');
			expect(params.get('limit')).toBe('5');
			return jsonResponse({ tracks: { items: [track, { id: 'bad', name: 'x' }] } });
		});
		const hits = await searchSpotifyTracks(' paper ', { credentials, fetch });
		expect(hits).toEqual([
			{
				id: '5aBcDeFgHiJkLmNoPqRsTu',
				name: 'Paper Planes at Dawn',
				artists: [{ name: 'Juno Paperplane' }],
				album: { name: 'Folds' },
				duration_ms: 312000,
				preview_url: null
			}
		]);
	});

	it('returns nothing for an empty query without a request', async () => {
		const fetch = mockSpotify();
		await expect(searchSpotifyTracks('  ', { credentials, fetch })).resolves.toEqual([]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('reports a failed search as a 502', async () => {
		const fetch = mockSpotify(() => jsonResponse({ error: { status: 500 } }, 500));
		await expect(searchSpotifyTracks('paper', { credentials, fetch })).rejects.toMatchObject({
			status: 502
		});
	});
});
