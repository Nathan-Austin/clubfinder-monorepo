// src/routes/api/logout/+server.ts
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ cookies }) => {
	// Clear all cookies with proper settings
	const cookiesToClear = [
		'isLoggedIn',
		'bar_email',
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
