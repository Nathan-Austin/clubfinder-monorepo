import { describe, expect, it, vi } from 'vitest';
import {
	ARTIST_REFRESH_AFTER_MS,
	addFavouriteArtist,
	deriveProfileGenres,
	deriveProfileGenreWeights,
	FavouriteLimitError,
	isArtistSource,
	isUuid,
	listFavouriteArtists,
	listFavouriteGenresForOwners,
	MAX_FAVOURITE_ARTISTS,
	mergeSearchResults,
	searchTasteArtists,
	normalizeGenres,
	removeFavouriteArtist,
	resolveTasteArtist,
	rowToTasteArtist,
	type ArtistDetails,
	type Queryable
} from './favouriteArtists';
import { resolveSessionUserId } from './sessionUser';
import { getProfileGenresForSession } from './profileGenres';

const USER = '00000000-0000-4000-8000-000000000001';
const ARTIST_ID = '11111111-1111-4111-8111-111111111111';
// user_sessions.session_id is a uuid column, so real session ids look like this
const SESSION = '33333333-3333-4333-8333-333333333333';
const OTHER_SESSION = '44444444-4444-4444-8444-444444444444';

/** A Queryable that answers by matching a fragment of the SQL text, recording every call. */
function fakeDb(handlers: Array<[string, (params: unknown[]) => Record<string, unknown>[]]>) {
	const calls: Array<{ text: string; params: unknown[] }> = [];
	const db: Queryable = {
		async query(text, params = []) {
			calls.push({ text, params });
			const handler = handlers.find(([fragment]) => text.includes(fragment));
			if (!handler) throw new Error(`fakeDb: no handler for query: ${text}`);
			const rows = handler[1](params);
			return { rows, rowCount: rows.length };
		}
	};
	return { db, calls };
}

function artistRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: ARTIST_ID,
		source: 'spotify',
		source_id: '3aBcDeFgHiJkLmNoPqRsTu',
		name: 'Juno Paperplane',
		genres: ['Deep House', 'minimal'],
		image_url: null,
		fetched_at: new Date('2026-10-01T00:00:00Z'),
		...overrides
	};
}

describe('normalizeGenres', () => {
	it('lower-cases, trims, collapses spaces and de-duplicates in order', () => {
		expect(normalizeGenres([' Deep  House', 'deep house', 'TECHNO', '', 7, null])).toEqual([
			'deep house',
			'techno'
		]);
	});

	it('returns an empty list for anything that is not an array', () => {
		expect(normalizeGenres(undefined)).toEqual([]);
		expect(normalizeGenres('techno')).toEqual([]);
	});
});

describe('deriveProfileGenres', () => {
	it('is the sorted union of the artists genres', () => {
		expect(
			deriveProfileGenres([
				{ genres: ['techno', 'dub techno'] },
				{ genres: ['Deep House', 'techno'] },
				{ genres: [] }
			])
		).toEqual(['deep house', 'dub techno', 'techno']);
	});

	it('is empty without artists', () => {
		expect(deriveProfileGenres([])).toEqual([]);
	});
});

describe('deriveProfileGenreWeights', () => {
	it('counts how many artists carry each genre', () => {
		expect(
			deriveProfileGenreWeights([
				{ genres: ['techno', 'dub techno'] },
				{ genres: ['Deep House', 'techno'] },
				{ genres: ['techno'] }
			])
		).toEqual({ techno: 3, 'dub techno': 1, 'deep house': 1 });
	});

	it('counts a genre once per artist however often the artist repeats it', () => {
		expect(deriveProfileGenreWeights([{ genres: ['techno', 'Techno', ' techno '] }])).toEqual({
			techno: 1
		});
	});

	it('is empty without artists', () => {
		expect(deriveProfileGenreWeights([])).toEqual({});
	});
});

describe('rowToTasteArtist', () => {
	it('maps a database row and normalises its genres', () => {
		expect(rowToTasteArtist(artistRow())).toEqual({
			id: ARTIST_ID,
			source: 'spotify',
			sourceId: '3aBcDeFgHiJkLmNoPqRsTu',
			name: 'Juno Paperplane',
			genres: ['deep house', 'minimal'],
			imageUrl: null,
			fetchedAt: '2026-10-01T00:00:00.000Z'
		});
	});
});

describe('guards', () => {
	it('recognises the supported sources', () => {
		expect(isArtistSource('spotify')).toBe(true);
		expect(isArtistSource('lastfm')).toBe(true);
		expect(isArtistSource('soundcloud')).toBe(false);
		expect(isArtistSource(undefined)).toBe(false);
	});

	it('recognises uuids', () => {
		expect(isUuid(ARTIST_ID)).toBe(true);
		expect(isUuid('3aBcDeFgHiJkLmNoPqRsTu')).toBe(false);
		expect(isUuid(null)).toBe(false);
	});
});

describe('listFavouriteArtists', () => {
	it('returns the artists and their genre profile', async () => {
		const { db, calls } = fakeDb([
			[
				'FROM clubfindr.user_favourite_artists f',
				() => [artistRow(), artistRow({ id: '2', source_id: 'x', genres: ['techno'] })]
			]
		]);
		const profile = await listFavouriteArtists(db, USER);
		expect(calls[0].params).toEqual([USER]);
		expect(profile.artists).toHaveLength(2);
		expect(profile.genres).toEqual(['deep house', 'minimal', 'techno']);
	});
});

describe('resolveTasteArtist', () => {
	const details: ArtistDetails = {
		source: 'spotify',
		sourceId: '3aBcDeFgHiJkLmNoPqRsTu',
		name: 'Juno Paperplane',
		genres: ['deep house'],
		imageUrl: 'https://img.example/juno.jpg'
	};
	const now = () => Date.parse('2026-10-17T00:00:00Z');

	it('reuses a fresh catalogue row without asking the provider', async () => {
		const lookup = vi.fn();
		const { db } = fakeDb([['FROM clubfindr.taste_artists WHERE source', () => [artistRow()]]]);
		const artist = await resolveTasteArtist(db, 'spotify', details.sourceId, lookup, now);
		expect(artist.name).toBe('Juno Paperplane');
		expect(lookup).not.toHaveBeenCalled();
	});

	it('fetches and stores an artist that is not in the catalogue yet', async () => {
		const lookup = vi.fn().mockResolvedValue(details);
		const { db, calls } = fakeDb([
			['FROM clubfindr.taste_artists WHERE source', () => []],
			[
				'INSERT INTO clubfindr.taste_artists',
				(params) => [
					artistRow({
						source_id: params[1],
						name: params[2],
						genres: params[3],
						image_url: params[4]
					})
				]
			]
		]);
		const artist = await resolveTasteArtist(db, 'spotify', details.sourceId, lookup, now);
		expect(lookup).toHaveBeenCalledWith('spotify', details.sourceId);
		const insert = calls.find((c) => c.text.includes('INSERT INTO clubfindr.taste_artists'));
		expect(insert?.params).toEqual([
			'spotify',
			details.sourceId,
			'Juno Paperplane',
			['deep house'],
			'https://img.example/juno.jpg'
		]);
		expect(artist.imageUrl).toBe('https://img.example/juno.jpg');
	});

	it('refreshes a stale row from the provider', async () => {
		const stale = new Date(now() - ARTIST_REFRESH_AFTER_MS - 1000);
		const lookup = vi.fn().mockResolvedValue({ ...details, genres: ['deep house', 'lo-fi house'] });
		const { db } = fakeDb([
			['FROM clubfindr.taste_artists WHERE source', () => [artistRow({ fetched_at: stale })]],
			['INSERT INTO clubfindr.taste_artists', (params) => [artistRow({ genres: params[3] })]]
		]);
		const artist = await resolveTasteArtist(db, 'spotify', details.sourceId, lookup, now);
		expect(lookup).toHaveBeenCalledTimes(1);
		expect(artist.genres).toEqual(['deep house', 'lo-fi house']);
	});

	it('keeps the stale row when the provider fails', async () => {
		const stale = new Date(now() - ARTIST_REFRESH_AFTER_MS - 1000);
		const lookup = vi.fn().mockRejectedValue(new Error('offline'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { db } = fakeDb([
			['FROM clubfindr.taste_artists WHERE source', () => [artistRow({ fetched_at: stale })]]
		]);
		const artist = await resolveTasteArtist(db, 'spotify', details.sourceId, lookup, now);
		expect(artist.genres).toEqual(['deep house', 'minimal']);
		warn.mockRestore();
	});

	it('fails when the artist is unknown and the provider fails', async () => {
		const lookup = vi.fn().mockRejectedValue(new Error('offline'));
		const { db } = fakeDb([['FROM clubfindr.taste_artists WHERE source', () => []]]);
		await expect(resolveTasteArtist(db, 'spotify', details.sourceId, lookup, now)).rejects.toThrow(
			'offline'
		);
	});
});

describe('addFavouriteArtist', () => {
	it('reports a new link', async () => {
		const { db, calls } = fakeDb([
			['INSERT INTO clubfindr.user_favourite_artists', () => [{ artist_id: ARTIST_ID }]]
		]);
		await expect(addFavouriteArtist(db, USER, ARTIST_ID)).resolves.toEqual({ created: true });
		expect(calls[0].params).toEqual([USER, ARTIST_ID, MAX_FAVOURITE_ARTISTS]);
	});

	it('is a no-op for an artist that is already a favourite', async () => {
		const { db } = fakeDb([
			['INSERT INTO clubfindr.user_favourite_artists', () => []],
			['SELECT 1 FROM clubfindr.user_favourite_artists', () => [{ '?column?': 1 }]]
		]);
		await expect(addFavouriteArtist(db, USER, ARTIST_ID)).resolves.toEqual({ created: false });
	});

	it('throws FavouriteLimitError when the cap is reached', async () => {
		const { db } = fakeDb([
			['INSERT INTO clubfindr.user_favourite_artists', () => []],
			['SELECT 1 FROM clubfindr.user_favourite_artists', () => []]
		]);
		await expect(addFavouriteArtist(db, USER, ARTIST_ID)).rejects.toBeInstanceOf(
			FavouriteLimitError
		);
	});
});

describe('removeFavouriteArtist', () => {
	it('tells whether a row was deleted', async () => {
		const deleted = fakeDb([['DELETE FROM clubfindr.user_favourite_artists', () => [{}]]]);
		await expect(removeFavouriteArtist(deleted.db, USER, ARTIST_ID)).resolves.toBe(true);
		expect(deleted.calls[0].params).toEqual([USER, ARTIST_ID]);

		const missing = fakeDb([['DELETE FROM clubfindr.user_favourite_artists', () => []]]);
		await expect(removeFavouriteArtist(missing.db, USER, ARTIST_ID)).resolves.toBe(false);
	});
});

describe('resolveSessionUserId', () => {
	it('returns the user of a session and null otherwise', async () => {
		const { db, calls } = fakeDb([
			[
				'FROM clubfindr.user_sessions',
				(params) => (params[0] === SESSION ? [{ user_id: USER }] : [])
			]
		]);
		await expect(resolveSessionUserId(db, SESSION)).resolves.toBe(USER);
		await expect(resolveSessionUserId(db, OTHER_SESSION)).resolves.toBeNull();
		await expect(resolveSessionUserId(db, null)).resolves.toBeNull();
		expect(calls).toHaveLength(2);
	});

	it('never queries for a malformed id, which the uuid column would reject with an error', async () => {
		const { db, calls } = fakeDb([['FROM clubfindr.user_sessions', () => [{ user_id: USER }]]]);
		await expect(resolveSessionUserId(db, 'not-a-session')).resolves.toBeNull();
		await expect(resolveSessionUserId(db, "' OR 1=1 --")).resolves.toBeNull();
		expect(calls).toHaveLength(0);
	});
});

describe('searchTasteArtists', () => {
	it('searches the catalogue by name with LIKE wildcards escaped', async () => {
		const { db, calls } = fakeDb([['FROM clubfindr.taste_artists', () => [artistRow()]]]);
		const hits = await searchTasteArtists(db, ' 50%_juno\\ ');
		expect(hits).toHaveLength(1);
		expect(calls[0].params).toEqual(['%50\\%\\_juno\\\\%', '50%_juno\\', 10]);
	});

	it('skips the database for an empty query', async () => {
		const { db, calls } = fakeDb([]);
		await expect(searchTasteArtists(db, '   ')).resolves.toEqual([]);
		expect(calls).toHaveLength(0);
	});
});

describe('mergeSearchResults', () => {
	const catalogue = [rowToTasteArtist(artistRow())];
	const provider: ArtistDetails[] = [
		{
			source: 'spotify',
			sourceId: '3aBcDeFgHiJkLmNoPqRsTu', // same artist as the catalogue row
			name: 'Juno Paperplane',
			genres: ['deep house'],
			imageUrl: null
		},
		{
			source: 'spotify',
			sourceId: '4aBcDeFgHiJkLmNoPqRsTu',
			name: 'Juno Quartz',
			genres: ['trance'],
			imageUrl: null
		}
	];

	it('puts catalogue hits first, drops provider duplicates and flags favourites', () => {
		const hits = mergeSearchResults(catalogue, provider, new Set([ARTIST_ID]));
		expect(hits.map((h) => [h.name, h.favourite, h.catalogueId])).toEqual([
			['Juno Paperplane', true, ARTIST_ID],
			['Juno Quartz', false, null]
		]);
	});

	it('lists the same artist once when it is catalogued from several providers', () => {
		const twin = rowToTasteArtist(
			artistRow({ id: 'twin', source: 'lastfm', source_id: 'Juno Paperplane' })
		);
		// The favourite row wins even when it comes second
		const hits = mergeSearchResults([twin, ...catalogue], provider, new Set([ARTIST_ID]));
		expect(hits.map((h) => [h.name, h.catalogueId, h.favourite])).toEqual([
			['Juno Paperplane', ARTIST_ID, true],
			['Juno Quartz', null, false]
		]);
		// Without a favourite the first catalogue row is kept
		expect(mergeSearchResults([twin, ...catalogue], [], new Set())[0].catalogueId).toBe('twin');
	});

	it('respects the limit and works without catalogue hits', () => {
		expect(mergeSearchResults([], provider, new Set(), 1)).toHaveLength(1);
		expect(mergeSearchResults([], provider, new Set())[0].favourite).toBe(false);
	});
});

describe('getProfileGenresForSession', () => {
	it('returns the genre set of the session user, or nothing without a session', async () => {
		const { db, calls } = fakeDb([
			['FROM clubfindr.user_sessions', () => [{ user_id: USER }]],
			[
				'FROM clubfindr.user_favourite_artists f',
				() => [artistRow(), artistRow({ id: '2', source_id: 'x', genres: ['Techno'] })]
			]
		]);
		await expect(getProfileGenresForSession(db, SESSION)).resolves.toEqual([
			'deep house',
			'minimal',
			'techno'
		]);
		await expect(getProfileGenresForSession(db, null)).resolves.toEqual([]);
		expect(calls).toHaveLength(2);
	});

	it('is empty for a session without a user', async () => {
		const { db } = fakeDb([['FROM clubfindr.user_sessions', () => []]]);
		await expect(getProfileGenresForSession(db, OTHER_SESSION)).resolves.toEqual([]);
	});
});

describe('listFavouriteGenresForOwners', () => {
	const BAR_A = '00000000-0000-4000-8000-0000000000b1';
	const BAR_B = '00000000-0000-4000-8000-0000000000b2';

	it('collects each venue’s artists into one de-duplicated genre set, in one query', async () => {
		const { db, calls } = fakeDb([
			[
				'FROM clubfindr.bar_favourite_artists f',
				() => [
					{ owner_id: BAR_A, genres: ['Deep House', 'minimal'] },
					{ owner_id: BAR_A, genres: ['deep house', 'dub techno'] },
					{ owner_id: BAR_B, genres: ['ambient'] }
				]
			]
		]);

		const byBar = await listFavouriteGenresForOwners(db, [BAR_A, BAR_B], 'bar');
		expect(byBar.get(BAR_A)).toEqual(['deep house', 'minimal', 'dub techno']);
		expect(byBar.get(BAR_B)).toEqual(['ambient']);
		// One round trip however many venues are on the page
		expect(calls).toHaveLength(1);
		expect(calls[0].params).toEqual([[BAR_A, BAR_B]]);
	});

	it('leaves venues without artists out of the map', async () => {
		const { db } = fakeDb([
			['FROM clubfindr.bar_favourite_artists f', () => [{ owner_id: BAR_A, genres: ['techno'] }]]
		]);
		const byBar = await listFavouriteGenresForOwners(db, [BAR_A, BAR_B], 'bar');
		expect(byBar.has(BAR_B)).toBe(false);
		expect(byBar.size).toBe(1);
	});

	it('asks nothing when there is no usable id', async () => {
		const { db, calls } = fakeDb([]);
		await expect(listFavouriteGenresForOwners(db, [], 'bar')).resolves.toEqual(new Map());
		await expect(listFavouriteGenresForOwners(db, ['not-a-uuid'], 'bar')).resolves.toEqual(
			new Map()
		);
		expect(calls).toHaveLength(0);
	});

	it('de-duplicates the ids it is given', async () => {
		const { db, calls } = fakeDb([['FROM clubfindr.bar_favourite_artists f', () => []]]);
		await listFavouriteGenresForOwners(db, [BAR_A, BAR_A, BAR_B], 'bar');
		expect(calls[0].params).toEqual([[BAR_A, BAR_B]]);
	});

	it('reads the user table for the user scope', async () => {
		const { db, calls } = fakeDb([['FROM clubfindr.user_favourite_artists f', () => []]]);
		await listFavouriteGenresForOwners(db, [USER], 'user');
		expect(calls[0].text).toContain('clubfindr.user_favourite_artists');
		expect(calls[0].text).toContain('f.user_id = ANY($1)');
	});
});
