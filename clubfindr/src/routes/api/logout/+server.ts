// src/routes/api/logout/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { pool } from '$lib/db';
import { endBarSession } from '$lib/taste/barSession';

export const POST: RequestHandler = async ({ cookies }) => {
	// A venue's dashboard session is a bar_sessions row: end it, not just the cookie
	try {
		await endBarSession(pool, cookies);
	} catch (error) {
		console.error('Could not end the venue session:', error);
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
