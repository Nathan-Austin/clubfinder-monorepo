// src/routes/api/logout/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { pool, query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';
import { endBarSession } from '$lib/taste/barSession';
import { USER_SESSION_COOKIE } from '$lib/server/promoterAuth';
import { evictSessions } from '$lib/server/sessionCache';

export const POST: RequestHandler = async ({ cookies }) => {
	// A venue's dashboard session is a bar_sessions row: end it, not just the cookie
	try {
		await endBarSession(pool, cookies);
	} catch (error) {
		console.error('Could not end the venue session:', error);
	}
	// A promoter's (since 2026-11-14) is a user_sessions row: the same, and evicted from the
	// hooks.server.ts cache, as /logout does (KNOWN_ISSUES 41)
	try {
		const sessionId = cookieManager.get(cookies, USER_SESSION_COOKIE);
		if (sessionId) {
			await query('DELETE FROM clubfindr.user_sessions WHERE session_id = $1', [sessionId]);
			evictSessions([sessionId]);
		}
	} catch (error) {
		console.error('Could not end the user session:', error);
	}
	// Clear all cookies with proper settings
	const cookiesToClear = [
		'isLoggedIn',
		'bar_email',
		'barId',
		'spotifyAccessToken',
		'spotifyRefreshToken',
		'barsName',
		'city',
		'promoterId',
		'usersId',
		'usersName',
		'sessionId'
	];

	cookiesToClear.forEach((cookieName) => {
		cookies.delete(cookieName, {
			path: '/',
			secure: true,
			sameSite: 'lax'
		});
	});

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json'
		}
	});
};
