// Who may change a venue's taste profile, for /api/venues/[barId]/taste/*.
//
// Two ways in, because the same endpoints serve the web dashboard and the app:
//
//   web    the `barId` cookie set at /login/bars, as the bar event endpoints already use;
//   mobile `Authorization: Bearer <token>`, the token /api/mobile/bars/login returns, which
//          is a clubfindr.bar_sessions.session_id.
//
// Both are checked against the venue in the URL, so a logged-in venue can only read and
// write its own profile. (The existing /api/mobile/bars/[barId]/events endpoints check
// nothing at all; that is a separate problem, not one to copy here.)

import type { Cookies } from '@sveltejs/kit';
import { isUuid, type Queryable } from './favouriteArtists';

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
	// Plain cookie, not a cookieManager one: that is how /login/bars writes it and how the
	// bar event endpoints read it
	if (cookies.get('barId') === barId) return true;
	return (await resolveBarSession(db, bearerToken(request))) === barId;
}
