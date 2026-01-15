// src/routes/api/get-bar-spotify-app/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionId = cookieManager.get(cookies, 'sessionId');
	const barId = cookieManager.get(cookies, 'bar_id');

	// If we don't have either cookie, return error
	if (!sessionId && !barId) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		let resolvedBarId;

		// Try to get bar ID from cookies
		if (barId) {
			resolvedBarId = barId;
		} else if (sessionId) {
			// Try to get user ID from session, then find associated bar
			const sessionResult = await query(
				'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1',
				[sessionId]
			);

			if (sessionResult.rows.length > 0) {
				const userId = sessionResult.rows[0].user_id;

				// Check if this user is associated with any bars
				const barResult = await query('SELECT id FROM clubfindr.bars WHERE user_id = $1 LIMIT 1', [
					userId
				]);

				if (barResult.rows.length > 0) {
					resolvedBarId = barResult.rows[0].id;
				}
			}
		}

		if (!resolvedBarId) {
			return json({ error: 'Bar not found' }, { status: 404 });
		}

		// Get client ID from the bar's associated app
		const clientIdResult = await query(
			`SELECT sa.client_id 
            FROM clubfindr.bars b
            JOIN clubfindr.spotify_apps sa ON b.spotify_app_name = sa.app_name
            WHERE b.id = $1`,
			[resolvedBarId]
		);

		if (clientIdResult.rows.length > 0) {
			return json({ clientId: clientIdResult.rows[0].client_id });
		}

		// If no app is associated with the bar, use the default bar app
		const defaultAppResult = await query(
			`SELECT client_id FROM clubfindr.spotify_apps 
             WHERE app_type = 'bar' AND is_active = true 
             ORDER BY user_count ASC LIMIT 1`,
			[]
		);

		if (defaultAppResult.rows.length === 0) {
			// Fall back to any available app
			const anyAppResult = await query(
				'SELECT client_id FROM clubfindr.spotify_apps WHERE is_active = true LIMIT 1',
				[]
			);

			if (anyAppResult.rows.length === 0) {
				return json({ error: 'No Spotify app configured' }, { status: 500 });
			}

			return json({ clientId: anyAppResult.rows[0].client_id });
		}

		return json({ clientId: defaultAppResult.rows[0].client_id });
	} catch (error) {
		console.error('Error retrieving bar Spotify app details:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
