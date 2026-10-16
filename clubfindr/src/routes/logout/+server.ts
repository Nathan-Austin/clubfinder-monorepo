import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';
import { dev } from '$app/environment';

export const GET: RequestHandler = async ({ cookies, locals, url }) => {
	try {
		// Get the current session ID
		const sessionId = cookieManager.get(cookies, 'sessionId');

		if (sessionId) {
			// Delete the session from the database with additional logging
			const deleteResult = await query(
				'DELETE FROM clubfindr.user_sessions WHERE session_id = $1',
				[sessionId]
			);

			if (deleteResult.rowCount === 0) {
				console.warn(`No session found for sessionId: ${sessionId}`);
			}
		}

		// Clear all authentication-related cookies with enhanced security
		const cookiesToDelete = [
			'sessionId',
			'isLoggedIn',
			'spotifyAccessToken',
			'spotifyRefreshToken',
			'usersName',
			'city',
			'usersId'
		];

		cookiesToDelete.forEach((cookieName) => {
			cookies.delete(cookieName, {
				path: '/',
				domain: url.hostname,
				httpOnly: true,
				secure: !dev,
				sameSite: 'strict'
			});
		});

		// Clear locals
		locals.user = undefined;

		// Prepare redirect URL (default to home page)
		const redirectUrl = url.searchParams.get('redirectTo') || '/';

		// Return a response with success status and redirect information
		return new Response(
			JSON.stringify({
				success: true,
				redirectUrl
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
					Pragma: 'no-cache',
					Expires: '0',
					Location: redirectUrl
				}
			}
		);
	} catch (error) {
		console.error('Logout error:', error);

		// More detailed error logging
		if (error instanceof Error) {
			console.error('Error details:', {
				message: error.message,
				stack: error.stack
			});
		}

		return new Response(
			JSON.stringify({
				success: false,
				message:
					error instanceof Error ? error.message : 'An unexpected error occurred during logout'
			}),
			{
				status: 500
			}
		);
	}
};
