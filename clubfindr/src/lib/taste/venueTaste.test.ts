import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import {
	addFavouriteArtist,
	countFavouriteArtists,
	FAVOURITE_SCOPES,
	isFavouriteOwner,
	listFavouriteArtists,
	removeFavouriteArtist,
	type Queryable
} from './favouriteArtists';
import { bearerToken, canManageBar, resolveBarSession } from './barSession';

const BAR = '00000000-0000-4000-8000-0000000000b1';
const OTHER_BAR = '00000000-0000-4000-8000-0000000000b2';
const USER = '00000000-0000-4000-8000-000000000001';
const ARTIST_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';

/** Records every query; answers each with `rows`. */
function recordingDb(rows: Record<string, unknown>[] = []) {
	const calls: Array<{ text: string; params: unknown[] }> = [];
	const db: Queryable = {
		async query(text, params = []) {
			calls.push({ text, params });
			return { rows, rowCount: rows.length };
		}
	};
	return { db, calls };
}

const fakeCookies = (values: Record<string, string>) =>
	({ get: (name: string) => values[name] }) as unknown as Cookies;

const requestWith = (headers: Record<string, string> = {}) =>
	new Request('http://localhost/api/venues/x/taste/artists', { headers });

describe('favourite scopes', () => {
	it('keeps venue favourites in their own table, away from users', () => {
		expect(FAVOURITE_SCOPES.user).toEqual({
			table: 'clubfindr.user_favourite_artists',
			column: 'user_id'
		});
		expect(FAVOURITE_SCOPES.bar).toEqual({
			table: 'clubfindr.bar_favourite_artists',
			column: 'bar_id'
		});
	});

	it('recognises only the known owners', () => {
		expect(isFavouriteOwner('user')).toBe(true);
		expect(isFavouriteOwner('bar')).toBe(true);
		for (const value of ['venue', '', 'User', null, 7, undefined]) {
			expect(isFavouriteOwner(value)).toBe(false);
		}
	});

	it('defaults to the user tables, so existing callers are unchanged', async () => {
		const { db, calls } = recordingDb();
		await listFavouriteArtists(db, USER);
		await countFavouriteArtists(db, USER);
		await removeFavouriteArtist(db, USER, ARTIST_ID);
		for (const call of calls) {
			expect(call.text).toContain('clubfindr.user_favourite_artists');
			expect(call.text).not.toContain('bar_favourite_artists');
		}
	});

	it('reads a venue profile from the bar table, keyed by bar_id', async () => {
		const { db, calls } = recordingDb();
		await listFavouriteArtists(db, BAR, 'bar');
		expect(calls[0].text).toContain('clubfindr.bar_favourite_artists');
		expect(calls[0].text).toContain('f.bar_id = $1');
		expect(calls[0].text).toContain('JOIN clubfindr.taste_artists');
		expect(calls[0].params).toEqual([BAR]);
	});

	it('counts and removes venue artists in the bar table', async () => {
		const count = recordingDb([{ count: 2 }]);
		expect(await countFavouriteArtists(count.db, BAR, 'bar')).toBe(2);
		expect(count.calls[0].text).toContain('clubfindr.bar_favourite_artists');
		expect(count.calls[0].text).toContain('bar_id = $1');

		const removed = recordingDb([{ x: 1 }]);
		expect(await removeFavouriteArtist(removed.db, BAR, ARTIST_ID, 'bar')).toBe(true);
		expect(removed.calls[0].text).toContain('DELETE FROM clubfindr.bar_favourite_artists');
		expect(removed.calls[0].params).toEqual([BAR, ARTIST_ID]);
	});

	it('adds a venue artist with the bar conflict target and the shared cap', async () => {
		const { db, calls } = recordingDb([{ artist_id: ARTIST_ID }]);
		expect(await addFavouriteArtist(db, BAR, ARTIST_ID, 'bar')).toEqual({ created: true });
		expect(calls[0].text).toContain('INSERT INTO clubfindr.bar_favourite_artists (bar_id,');
		expect(calls[0].text).toContain('ON CONFLICT (bar_id, artist_id) DO NOTHING');
		expect(calls[0].params).toEqual([BAR, ARTIST_ID, 50]);
	});

	it('never interpolates the owner id into the SQL text', async () => {
		const { db, calls } = recordingDb();
		await listFavouriteArtists(db, BAR, 'bar');
		expect(calls[0].text).not.toContain(BAR);
	});
});

describe('bearerToken', () => {
	it('reads a Bearer header, case-insensitively and trimmed', () => {
		expect(bearerToken(requestWith({ authorization: `Bearer ${TOKEN}` }))).toBe(TOKEN);
		expect(bearerToken(requestWith({ authorization: `bearer   ${TOKEN}  ` }))).toBe(TOKEN);
	});

	it('is null without a usable Bearer header', () => {
		expect(bearerToken(requestWith())).toBeNull();
		expect(bearerToken(requestWith({ authorization: TOKEN }))).toBeNull();
		expect(bearerToken(requestWith({ authorization: 'Basic abc' }))).toBeNull();
		expect(bearerToken(requestWith({ authorization: 'Bearer    ' }))).toBeNull();
	});
});

describe('resolveBarSession', () => {
	const NOW = Date.parse('2026-11-08T12:00:00Z');
	const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000);
	const clock = () => NOW;

	it('returns the venue of a session used within 30 days, and slides the window', async () => {
		const { db, calls } = recordingDb([{ bar_id: BAR, last_accessed: daysAgo(29) }]);
		expect(await resolveBarSession(db, TOKEN, clock)).toBe(BAR);
		expect(calls[0].text).toContain('FROM clubfindr.bar_sessions WHERE session_id = $1');
		expect(calls[0].params).toEqual([TOKEN]);
		// last_accessed refreshed to now (in the background)
		expect(calls[1].text).toContain('UPDATE clubfindr.bar_sessions SET last_accessed');
		expect(calls[1].params).toEqual([new Date(NOW).toISOString(), TOKEN]);
	});

	it('deletes and refuses a session unused for more than 30 days', async () => {
		const { db, calls } = recordingDb([{ bar_id: BAR, last_accessed: daysAgo(31) }]);
		expect(await resolveBarSession(db, TOKEN, clock)).toBeNull();
		expect(calls[1].text).toContain('DELETE FROM clubfindr.bar_sessions');
		expect(calls[1].params).toEqual([TOKEN]);
		expect(calls.some((c) => c.text.startsWith('UPDATE'))).toBe(false);
	});

	it('reads last_accessed whether node-pg gives a Date or a string', async () => {
		const asString = recordingDb([{ bar_id: BAR, last_accessed: daysAgo(1).toISOString() }]);
		expect(await resolveBarSession(asString.db, TOKEN, clock)).toBe(BAR);
	});

	it('is null for an unknown session', async () => {
		const { db } = recordingDb([]);
		expect(await resolveBarSession(db, TOKEN, clock)).toBeNull();
	});

	it('never queries for a missing or malformed token', async () => {
		const { db, calls } = recordingDb([{ bar_id: BAR, last_accessed: daysAgo(1) }]);
		expect(await resolveBarSession(db, null)).toBeNull();
		expect(await resolveBarSession(db, 'not-a-uuid')).toBeNull();
		expect(await resolveBarSession(db, "' OR 1=1 --")).toBeNull();
		expect(calls).toEqual([]);
	});
});

describe('canManageBar', () => {
	it('accepts the dashboard cookie for the same venue, without a query', async () => {
		const { db, calls } = recordingDb();
		const allowed = await canManageBar(db, BAR, {
			cookies: fakeCookies({ barId: BAR }),
			request: requestWith()
		});
		expect(allowed).toBe(true);
		expect(calls).toEqual([]);
	});

	it('refuses a cookie for another venue', async () => {
		const { db } = recordingDb([]);
		expect(
			await canManageBar(db, BAR, {
				cookies: fakeCookies({ barId: OTHER_BAR }),
				request: requestWith()
			})
		).toBe(false);
	});

	it('accepts a mobile token whose session belongs to the venue', async () => {
		const { db } = recordingDb([{ bar_id: BAR, last_accessed: new Date() }]);
		expect(
			await canManageBar(db, BAR, {
				cookies: fakeCookies({}),
				request: requestWith({ authorization: `Bearer ${TOKEN}` })
			})
		).toBe(true);
	});

	it("refuses a mobile token for a different venue's session", async () => {
		const { db } = recordingDb([{ bar_id: OTHER_BAR, last_accessed: new Date() }]);
		expect(
			await canManageBar(db, BAR, {
				cookies: fakeCookies({}),
				request: requestWith({ authorization: `Bearer ${TOKEN}` })
			})
		).toBe(false);
	});

	it('refuses when neither is given, and for a malformed barId', async () => {
		const { db } = recordingDb([]);
		expect(await canManageBar(db, BAR, { cookies: fakeCookies({}), request: requestWith() })).toBe(
			false
		);
		expect(
			await canManageBar(db, 'not-a-uuid', {
				cookies: fakeCookies({ barId: 'not-a-uuid' }),
				request: requestWith()
			})
		).toBe(false);
	});
});
