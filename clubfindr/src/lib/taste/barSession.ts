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

/** Sessions older than this no longer authorise anything (user sessions use 7 days too). */
export const BAR_SESSION_MAX_AGE_DAYS = 7;

export function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	const token = match?.[1]?.trim();
	return token ? token : null;
}

/** The venue a mobile session token belongs to, or null if it is unknown or too old. */
export async function resolveBarSession(
	db: Queryable,
	token: string | null
): Promise<string | null> {
	if (!token || !isUuid(token)) return null;
	const result = await db.query(
		`SELECT bar_id FROM clubfindr.bar_sessions
		 WHERE session_id = $1
		   AND last_accessed > now() - ($2 || ' days')::interval`,
		[token, String(BAR_SESSION_MAX_AGE_DAYS)]
	);
	const barId = result.rows[0]?.bar_id;
	return typeof barId === 'string' && barId ? barId : null;
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
