// Who may act as a promoter, for /promoter-home and its event endpoints.
//
// A promoter is a clubfindr.users row with is_promoter = true, and their dashboard login is a
// clubfindr.user_sessions row, the same table and the same encrypted httpOnly `sessionId`
// cookie a regular user's login uses (cookieManager, AES-256-GCM, so it cannot be forged or
// read by page scripts). Until 2026-11-14 /login/bars set a plain `promoterId=<users.id>`
// cookie, neither httpOnly nor signed, and every promoter route trusted it as it was, so anyone
// who knew or guessed a promoter's user id could list, create, edit and delete their events
// (KNOWN_ISSUES 51). The same flaw the venue guard had (KNOWN_ISSUES 52, $lib/taste/barSession).
//
// The `promoterId` cookie is still set, httpOnly, for the layout to show the partner menu; it
// is never trusted for anything.

import { error, type Cookies } from '@sveltejs/kit';
import { cookieManager } from '$lib/cookieManager';
import { isUuid, type Queryable } from '$lib/taste/favouriteArtists';
import { openUserSession } from '$lib/server/userSessions';

/** The one session cookie, shared with /login/users (resolved by hooks.server.ts too). */
export const USER_SESSION_COOKIE = 'sessionId';

/**
 * A user session stops authorising anything this long after it was last used. The same rule
 * hooks.server.ts applies when it resolves locals.user, so a promoter's session and a
 * listener's session expire alike.
 */
export const USER_SESSION_MAX_AGE_DAYS = 7;
const MAX_AGE_MS = USER_SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

function msSince(value: unknown, now: number): number {
	const then = Date.parse(value instanceof Date ? value.toISOString() : String(value));
	return Number.isFinite(then) ? now - then : Number.POSITIVE_INFINITY;
}

/**
 * The session for a promoter who has just proved their password; returns its id.
 *
 * A row of its own (KNOWN_ISSUES 95): until 2026-11-19 user_sessions held one row per user, so
 * this reused the live session the same person held in the app rather than replace it. Now the
 * dashboard and the app each keep theirs.
 */
export async function createPromoterSession(
	db: Queryable,
	userId: string,
	now: () => number = Date.now
): Promise<string> {
	const sessionId = crypto.randomUUID();
	await openUserSession(db, sessionId, userId, null, new Date(now()));
	return sessionId;
}

/**
 * The promoter the session cookie belongs to, or null: no cookie, a forged or unknown one, an
 * expired session, or a session of a user who is not a promoter. Expiry is left to
 * hooks.server.ts, which deletes stale rows as it meets them.
 */
export async function promoterIdFromSession(
	db: Queryable,
	cookies: Cookies,
	now: () => number = Date.now
): Promise<string | null> {
	const sessionId = cookieManager.get(cookies, USER_SESSION_COOKIE);
	if (!sessionId || !isUuid(sessionId)) return null;
	const result = await db.query(
		`SELECT s.user_id, s.last_accessed
		   FROM clubfindr.user_sessions s
		   JOIN clubfindr.users u ON u.id = s.user_id
		  WHERE s.session_id = $1 AND u.is_promoter = true`,
		[sessionId]
	);
	const row = result.rows[0];
	if (!row || typeof row.user_id !== 'string' || !row.user_id) return null;
	if (msSince(row.last_accessed, now()) > MAX_AGE_MS) return null;
	return row.user_id;
}

/** The logged-in promoter's user id, or a 401 for the endpoint to send. */
export async function requirePromoter(db: Queryable, cookies: Cookies): Promise<string> {
	const promoterId = await promoterIdFromSession(db, cookies);
	if (!promoterId) throw error(401, 'Unauthorized');
	return promoterId;
}
