// Resolves the logged-in user for the taste endpoints. API routes do not get
// event.locals.user (hooks.server.ts returns early for /api/*), so they look the session up
// themselves, like the other endpoints do.

import type { Cookies } from '@sveltejs/kit';
import { cookieManager } from '$lib/cookieManager';
import type { Queryable } from './favouriteArtists';

export async function resolveSessionUserId(
	db: Queryable,
	sessionId: string | null
): Promise<string | null> {
	if (!sessionId) return null;
	const result = await db.query(
		'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1',
		[sessionId]
	);
	const userId = result.rows[0]?.user_id;
	return typeof userId === 'string' && userId ? userId : null;
}

export async function getSessionUserId(cookies: Cookies, db: Queryable): Promise<string | null> {
	return resolveSessionUserId(db, cookieManager.get(cookies, 'sessionId'));
}
