// src/routes/spotify/reauth/+server.ts
import { json, redirect } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import { query } from '$lib/db';
import { VITE_SPOTIFY_REDIRECT_USER_URI, VITE_SPOTIFY_REDIRECT_BAR_URI } from '$env/static/private';
import { cookieManager } from '$lib/cookieManager';
import { storeState } from '$lib/tempStore';

export const GET = async ({ url, cookies }) => {
	console.log('=== Starting Spotify reauth process ===');
	const returnTo = url.searchParams.get('returnTo') || '/spotify';
	const sessionId = cookieManager.get(cookies, 'sessionId');
	const userId = cookieManager.get(cookies, 'usersId');
	const barId = cookies.get('barId');

	console.log('Reauth request details:', { returnTo, sessionId, userId, barId });

	try {
		// Generate a new state parameter
		const stateKey = uuidv4();
		const city = cookies.get('city') || cookies.get('bar_city') || 'unknown';

		// Determine if this is a bar or user reauth
		const isBarReauth = !!barId;

		// In your reauth endpoint when creating state data
		const stateData = {
			city: city,
			origin: returnTo,
			timestamp: Date.now(),
			isReauth: true,
			userId: userId,
			barId: barId,
			isBarAuth: isBarReauth,
			source: isBarReauth ? 'bar-login' : 'user-home' // Add this line
		};
		// Save state to the database
		await storeState(stateKey, JSON.stringify(stateData));
		console.log('State stored with key:', stateKey);

		// Get client ID from cookies first (for bar managers)
		let clientId = cookies.get('spotifyClientId');
		const redirectUri = isBarReauth
			? VITE_SPOTIFY_REDIRECT_BAR_URI || 'https://www.clubfindr.com/spotify/login'
			: VITE_SPOTIFY_REDIRECT_USER_URI;

		console.log('Initial client ID from cookies:', clientId);
		console.log('Redirect URI:', redirectUri);

		// If no client ID in cookies, look it up based on user/bar ID
		if (!clientId) {
			if (isBarReauth) {
				// Try to get bar's Spotify app
				const barAppResult = await query(
					`SELECT sa.client_id
           FROM clubfindr.bars b
           JOIN clubfindr.spotify_apps sa ON b.spotify_app_name = sa.app_name
           WHERE b.id = $1`,
					[barId]
				);

				if (barAppResult.rows.length > 0) {
					clientId = barAppResult.rows[0].client_id;
					console.log('Found client ID for bar from database:', clientId);
				}
			} else if (userId) {
				// Try to get user's Spotify app
				const userAppResult = await query(
					`SELECT sa.client_id
           FROM clubfindr.users u
           JOIN clubfindr.spotify_apps sa ON u.spotify_app_name = sa.app_name
           WHERE u.id = $1`,
					[userId]
				);

				if (userAppResult.rows.length > 0) {
					clientId = userAppResult.rows[0].client_id;
					console.log('Found client ID for user from database:', clientId);
				}
			}
		}

		// Fallback to default app if still no client ID
		if (!clientId) {
			const defaultAppResult = await query(
				'SELECT client_id FROM clubfindr.spotify_apps WHERE app_name = $1',
				['default']
			);

			if (defaultAppResult.rows.length === 0) {
				throw new Error('No Spotify app credentials found');
			}

			clientId = defaultAppResult.rows[0].client_id;
			console.log('Using default Spotify app client ID:', clientId);
		}

		// Build Spotify authorization URL with appropriate scopes for the user type
		let scope;

		if (isBarReauth) {
			// Scopes for bar managers
			scope = [
				'user-read-playback-state',
				'user-read-currently-playing',
				'playlist-read-private',
				'playlist-read-collaborative',
				'user-read-recently-played',
				'user-top-read',
				'user-library-read',
				'user-read-email',
				'user-read-private'
			].join(' ');
		} else {
			// Scopes for regular users
			scope = 'user-read-private user-read-email user-top-read user-read-recently-played';
		}

		const authUrl = new URL('https://accounts.spotify.com/authorize');

		authUrl.searchParams.append('response_type', 'code');
		authUrl.searchParams.append('client_id', clientId);
		authUrl.searchParams.append('scope', scope);
		authUrl.searchParams.append('redirect_uri', redirectUri);
		authUrl.searchParams.append('state', stateKey);
		authUrl.searchParams.append('show_dialog', 'true'); // Force showing dialog for re-auth

		console.log('=== Redirecting to Spotify OAuth ===', authUrl.toString());

		// Also set a cookie with the state key for fallback recovery
		cookies.set('spotify_oauth_state', stateKey, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 // 1 hour
		});

		// Redirect to Spotify auth page
		throw redirect(302, authUrl.toString());
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err && err.status === 302) {
			throw err; // Re-throw redirect
		}

		console.error('Error preparing reauthorization:', err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Failed to prepare Spotify authorization'
			},
			{ status: 500 }
		);
	}
};

export const POST = async ({ request, cookies }) => {
	const data = await request.json();
	const returnTo = data.returnTo || '/spotify';
	const barId = cookies.get('barId');

	// Same logic as GET but returns JSON instead of redirecting
	try {
		// Generate a new state parameter
		const stateKey = uuidv4();
		const city = cookies.get('city') || cookies.get('bar_city') || 'unknown';
		const userId = cookieManager.get(cookies, 'usersId');

		// Determine if this is a bar or user reauth
		const isBarReauth = !!barId;

		// Store state with context
		const stateData = {
			city: city,
			origin: returnTo,
			timestamp: Date.now(),
			isReauth: true,
			userId: userId,
			barId: barId,
			isBarAuth: isBarReauth
		};

		// Save state to the database
		await storeState(stateKey, JSON.stringify(stateData));

		// Get client ID from cookies first (for bar managers)
		let clientId = cookies.get('spotifyClientId');
		const redirectUri = isBarReauth
			? VITE_SPOTIFY_REDIRECT_BAR_URI || 'https://www.clubfindr.com/spotify/login'
			: VITE_SPOTIFY_REDIRECT_USER_URI;

		// If no client ID in cookies, look it up based on user/bar ID
		if (!clientId) {
			if (isBarReauth) {
				// Try to get bar's Spotify app
				const barAppResult = await query(
					`SELECT sa.client_id
           FROM clubfindr.bars b
           JOIN clubfindr.spotify_apps sa ON b.spotify_app_name = sa.app_name
           WHERE b.id = $1`,
					[barId]
				);

				if (barAppResult.rows.length > 0) {
					clientId = barAppResult.rows[0].client_id;
				}
			} else if (userId) {
				// Try to get user's Spotify app
				const userAppResult = await query(
					`SELECT sa.client_id
           FROM clubfindr.users u
           JOIN clubfindr.spotify_apps sa ON u.spotify_app_name = sa.app_name
           WHERE u.id = $1`,
					[userId]
				);

				if (userAppResult.rows.length > 0) {
					clientId = userAppResult.rows[0].client_id;
				}
			}
		}

		// Fallback to default app if still no client ID
		if (!clientId) {
			const defaultAppResult = await query(
				'SELECT client_id FROM clubfindr.spotify_apps WHERE app_name = $1',
				['default']
			);

			if (defaultAppResult.rows.length === 0) {
				throw new Error('No Spotify app credentials found');
			}

			clientId = defaultAppResult.rows[0].client_id;
		}

		// Build Spotify authorization URL with appropriate scopes for the user type
		let scope;

		if (isBarReauth) {
			// Scopes for bar managers
			scope = [
				'user-read-playback-state',
				'user-read-currently-playing',
				'playlist-read-private',
				'playlist-read-collaborative',
				'user-read-recently-played',
				'user-top-read',
				'user-library-read',
				'user-read-email',
				'user-read-private'
			].join(' ');
		} else {
			// Scopes for regular users
			scope = 'user-read-private user-read-email user-top-read user-read-recently-played';
		}

		const authUrl = new URL('https://accounts.spotify.com/authorize');

		authUrl.searchParams.append('response_type', 'code');
		authUrl.searchParams.append('client_id', clientId);
		authUrl.searchParams.append('scope', scope);
		authUrl.searchParams.append('redirect_uri', redirectUri);
		authUrl.searchParams.append('state', stateKey);
		authUrl.searchParams.append('show_dialog', 'true'); // Force showing dialog for re-auth

		// Also set a cookie with the state key for fallback recovery
		cookies.set('spotify_oauth_state', stateKey, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 // 1 hour
		});

		return json({
			success: true,
			authUrl: authUrl.toString()
		});
	} catch (err: unknown) {
		console.error('Error preparing reauthorization:', err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Failed to prepare Spotify authorization'
			},
			{ status: 500 }
		);
	}
};
