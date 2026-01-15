// src/routes/api/get-spotify-app/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionId = cookieManager.get(cookies, 'sessionId');
	const user_id = cookieManager.get(cookies, 'usersId');

	// If we don't have either cookie, return error
	if (!sessionId && !user_id) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		let userId;

		// Try to get user ID from cookies
		if (user_id) {
			userId = user_id;
		} else if (sessionId) {
			// Try to get user ID from session
			const sessionResult = await query(
				'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1',
				[sessionId]
			);

			if (sessionResult.rows.length > 0) {
				userId = sessionResult.rows[0].user_id;
			}
		}

		if (!userId) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Get client ID from the user's associated app
		const clientIdResult = await query(
			`SELECT sa.client_id 
            FROM clubfindr.users u
            JOIN clubfindr.spotify_apps sa ON u.spotify_app_name = sa.app_name
            WHERE u.id = $1`,
			[userId]
		);

		if (clientIdResult.rows.length > 0) {
			return json({ clientId: clientIdResult.rows[0].client_id });
		}

		// If no app is associated with the user, use the default app
		const defaultAppResult = await query(
			'SELECT client_id FROM clubfindr.spotify_apps WHERE app_name = $1',
			['default']
		);

		if (defaultAppResult.rows.length === 0) {
			return json({ error: 'No Spotify app configured' }, { status: 500 });
		}

		return json({ clientId: defaultAppResult.rows[0].client_id });
	} catch (error) {
		console.error('Error retrieving Spotify app details:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
