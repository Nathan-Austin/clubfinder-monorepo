// Resolves the logged-in user for the taste endpoints. API routes do not get
// event.locals.user (hooks.server.ts returns early for /api/*), so they look the session up
// themselves, like the other endpoints do. The app sends the same session id as a Bearer
// token, so the taste endpoints serve web and mobile alike.

import type { Cookies } from '@sveltejs/kit';
import { cookieManager } from '$lib/cookieManager';
import { isUuid, type Queryable } from './favouriteArtists';
import { bearerToken } from './barSession';

export async function resolveSessionUserId(
	db: Queryable,
	sessionId: string | null
): Promise<string | null> {
	if (!sessionId || !isUuid(sessionId)) return null;
	const result = await db.query(
		'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1',
		[sessionId]
	);
	const userId = result.rows[0]?.user_id;
	return typeof userId === 'string' && userId ? userId : null;
}

/**
 * The logged-in user, by the web session cookie or, for the mobile app, by
 * `Authorization: Bearer <token>`, where the token is the user_sessions.session_id that
 * /api/mobile/login (or /login/users with isMobileApp) returned. Same table, same lookup:
 * there is no separate mobile token.
 */
export async function getSessionUserId(
	cookies: Cookies,
	db: Queryable,
	request?: Request
): Promise<string | null> {
	const fromCookie = await resolveSessionUserId(db, cookieManager.get(cookies, 'sessionId'));
	if (fromCookie || !request) return fromCookie;
	return resolveSessionUserId(db, bearerToken(request));
}
