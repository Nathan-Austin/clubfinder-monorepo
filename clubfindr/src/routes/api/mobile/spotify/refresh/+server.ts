// api/mobile/spotify/refresh/+server.ts
// Handle Spotify access token refresh for mobile app
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { refresh_token } = await request.json();
		const userId = cookieManager.get(cookies, 'usersId');

		if (!refresh_token) {
			return json({ error: 'No refresh token provided' }, { status: 400 });
		}

		// Find the appropriate Spotify app
		const appResult = await query(
			`SELECT sa.client_id, sa.client_secret
       FROM clubfindr.users u
       JOIN clubfindr.spotify_apps sa ON u.spotify_app_name = sa.app_name
       WHERE u.id = $1`,
			[userId]
		);

		const app =
			appResult?.rows?.[0] ||
			(
				await query(
					'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
					['default']
				)
			)?.rows?.[0];

		if (!app?.client_id || !app?.client_secret) {
			return json({ error: 'No Spotify app found' }, { status: 500 });
		}

		// Perform token refresh
		const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${Buffer.from(`${app.client_id}:${app.client_secret}`).toString(
					'base64'
				)}`
			},
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refresh_token
			})
		});

		if (!tokenResponse.ok) {
			return json({ error: 'Token refresh failed' }, { status: 401 });
		}

		const tokenData = await tokenResponse.json();

		return json({
			access_token: tokenData.access_token,
			expires_in: tokenData.expires_in || 3600
		});
	} catch (error) {
		console.error('Mobile Token Refresh Error:', error);
		return json(
			{
				error: 'Token refresh failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
