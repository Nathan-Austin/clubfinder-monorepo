// Who may change a venue's taste profile, for /api/venues/[barId]/taste/*.
//
// Two ways in, because the same endpoints serve the web dashboard and the app, and both are
// a clubfindr.bar_sessions row:
//
//   web    the encrypted, httpOnly `barSession` cookie /login/bars sets (cookieManager,
//          AES-256-GCM, so it cannot be forged or read by page scripts);
//   mobile `Authorization: Bearer <token>`, the token /api/mobile/bars/login returns.
//
// Both are checked against the venue in the URL, so a logged-in venue can only act for itself.
// The plain `barId` cookie /login/bars also sets is for the dashboard's own display and is never
// trusted: until 2026-11-13 canManageBar accepted it, so anyone could send `barId=<any venue>`
// and pass every venue write guard (KNOWN_ISSUES 52).

import type { Cookies } from '@sveltejs/kit';
import { cookieManager } from '$lib/cookieManager';
import { isUuid, type Queryable } from './favouriteArtists';

/** The web dashboard's session cookie (encrypted by cookieManager), a bar_sessions.session_id */
export const BAR_SESSION_COOKIE = 'barSession';

/**
 * A mobile bar session stops authorising anything this long after it was last used, and every
 * use pushes that back (a sliding window). The same rule $lib/authUtils.validateBarToken has
 * always applied; validateBarToken now calls resolveBarSession, so there is one rule.
 */
export const BAR_SESSION_MAX_AGE_DAYS = 30;
const MAX_AGE_MS = BAR_SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	const token = match?.[1]?.trim();
	return token ? token : null;
}

/**
 * The venue a mobile session token belongs to, or null if it is unknown or expired. An expired
 * session is deleted; a live one has its last_accessed refreshed in the background.
 */
export async function resolveBarSession(
	db: Queryable,
	token: string | null,
	now: () => number = Date.now
): Promise<string | null> {
	if (!token || !isUuid(token)) return null;
	const result = await db.query(
		'SELECT bar_id, last_accessed FROM clubfindr.bar_sessions WHERE session_id = $1',
		[token]
	);
	const row = result.rows[0];
	const barId = row?.bar_id;
	if (typeof barId !== 'string' || !barId) return null;

	const lastAccessed = Date.parse(
		row.last_accessed instanceof Date ? row.last_accessed.toISOString() : String(row.last_accessed)
	);
	if (!Number.isFinite(lastAccessed) || now() - lastAccessed > MAX_AGE_MS) {
		await db.query('DELETE FROM clubfindr.bar_sessions WHERE session_id = $1', [token]);
		return null;
	}

	db.query('UPDATE clubfindr.bar_sessions SET last_accessed = $1 WHERE session_id = $2', [
		new Date(now()).toISOString(),
		token
	]).catch((error: unknown) => console.error('Failed to update bar session timestamp:', error));
	return barId;
}

/** Starts a session for a venue that has just proved its password; returns its id. */
export async function createBarSession(
	db: Queryable,
	barId: string,
	{ platform = 'web', version = null as string | null, isMobile = false } = {}
): Promise<string> {
	const sessionId = crypto.randomUUID();
	await db.query(
		`INSERT INTO clubfindr.bar_sessions (session_id, bar_id, last_accessed, platform, version, is_mobile)
		 VALUES ($1, $2, NOW(), $3, $4, $5)`,
		[sessionId, barId, platform, version, isMobile]
	);
	return sessionId;
}

/** The venue the web dashboard cookie belongs to, or null (no cookie, forged, expired). */
export async function barIdFromSessionCookie(
	db: Queryable,
	cookies: Cookies
): Promise<string | null> {
	return resolveBarSession(db, cookieManager.get(cookies, BAR_SESSION_COOKIE));
}

/** Ends the web dashboard session: deletes the row and the cookie. */
export async function endBarSession(db: Queryable, cookies: Cookies): Promise<void> {
	const token = cookieManager.get(cookies, BAR_SESSION_COOKIE);
	if (token && isUuid(token)) {
		await db.query('DELETE FROM clubfindr.bar_sessions WHERE session_id = $1', [token]);
	}
	cookies.delete(BAR_SESSION_COOKIE, { path: '/' });
}

/**
 * True when the request may act for `barId`. `barId` must already be a uuid; the caller
 * answers 400 for anything else, so a malformed id is never confused with a refusal.
 */
export async function canManageBar(
	db: Queryable,
	barId: string,
	{ cookies, request }: { cookies: Cookies; request: Request }
): Promise<boolean> {
	if (!isUuid(barId)) return false;
	if ((await barIdFromSessionCookie(db, cookies)) === barId) return true;
	return (await resolveBarSession(db, bearerToken(request))) === barId;
}
