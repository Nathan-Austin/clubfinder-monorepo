// Ends every web login a browser holds and clears its cookies: the venue dashboard session
// (bar_sessions), the user session (user_sessions, customer or promoter, evicted from the
// hooks.server.ts cache, KNOWN_ISSUES 41) and every cookie the logins set.
//
// Used by POST /api/logout (the header's "Log Out") and by DELETE /api/bars/:barId. Deleting a
// venue used to clear only barId, barsName and bar_city: bar_email stayed, so the header kept
// showing "Partner Menu / Log Out" (+layout.server.ts reads it as a partner login), and a
// personal login made earlier in the same browser stayed too (DEVICE_CHECKLIST, versionCode 12
// round, section 1). Owner's decision 2026-11-19: deleting the venue logs the browser out.
import type { Cookies } from '@sveltejs/kit';
import { pool, query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';
import { endBarSession } from '$lib/taste/barSession';
import { USER_SESSION_COOKIE } from '$lib/server/promoterAuth';
import { evictSessions } from '$lib/server/sessionCache';

/** Every cookie a web login sets (login/users, login/bars, storestate's search cookies). */
export const WEB_LOGIN_COOKIES = [
	'isLoggedIn',
	'usersId',
	'usersName',
	'sessionId',
	'userId',
	'promoterId',
	'hasDualRole',
	'bar_email',
	'barId',
	'barsName',
	'bar_city',
	'city',
	'spotifyAccessToken',
	'spotifyRefreshToken'
] as const;

export async function endWebLogin(cookies: Cookies): Promise<void> {
	// A venue's dashboard session is a bar_sessions row: end it, not just the cookie
	try {
		await endBarSession(pool, cookies);
	} catch (error) {
		console.error('Could not end the venue session:', error);
	}
	// A customer's or promoter's is a user_sessions row: the same, and out of the cache
	try {
		const sessionId = cookieManager.get(cookies, USER_SESSION_COOKIE);
		if (sessionId) {
			await query('DELETE FROM clubfindr.user_sessions WHERE session_id = $1', [sessionId]);
			evictSessions([sessionId]);
		}
	} catch (error) {
		console.error('Could not end the user session:', error);
	}
	for (const name of WEB_LOGIN_COOKIES) {
		cookies.delete(name, { path: '/', secure: true, sameSite: 'lax' });
	}
}
