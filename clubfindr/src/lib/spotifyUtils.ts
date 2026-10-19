import { error, isHttpError, redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';
import { describeSpotifyFailure, spotifyTokenEndpoint } from '$lib/spotifyHosts';
const REFRESH_TOKEN_COOKIE = 'spotifyRefreshToken';

const fetchWithAuth = async (endpoint: string, accessToken: string) =>
	await fetch(endpoint, {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

const fetchAccessToken = async (cookies: Cookies) => {
	// Get the refresh token securely
	const refreshToken = cookieManager.get(cookies, REFRESH_TOKEN_COOKIE);

	if (!refreshToken) {
		console.error('No refresh token in cookies');
		throw error(500, 'No refresh token available');
	}

	// Get user ID to find the correct client credentials (now using secured cookies)
	const userId = cookieManager.get(cookies, 'usersId');
	const sessionId = cookieManager.get(cookies, 'sessionId');

	let clientId, clientSecret;

	// Try to get client credentials from database based on user ID
	try {
		let userIdForQuery = userId;

		// If no user ID, try to get it from session
		if (!userIdForQuery && sessionId) {
			const sessionResult = await query(
				'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1',
				[sessionId]
			);

			if (sessionResult.rows.length > 0) {
				userIdForQuery = sessionResult.rows[0].user_id;
				console.log('Found user ID from session:', userIdForQuery);
			}
		}

		if (userIdForQuery) {
			// Get the user's app details
			const userAppResult = await query(
				`SELECT sa.client_id, sa.client_secret 
				FROM clubfindr.users u
				JOIN clubfindr.spotify_apps sa ON u.spotify_app_name = sa.app_name
				WHERE u.id = $1`,
				[userIdForQuery]
			);

			if (userAppResult.rows.length > 0) {
				clientId = userAppResult.rows[0].client_id;
				clientSecret = userAppResult.rows[0].client_secret;
				console.log('Using user-specific Spotify app for token refresh');
			} else {
				// If no app is assigned to the user, get a default app
				const defaultAppResult = await query(
					'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
					['default']
				);

				if (defaultAppResult.rows.length > 0) {
					clientId = defaultAppResult.rows[0].client_id;
					clientSecret = defaultAppResult.rows[0].client_secret;
					console.log('Using default Spotify app for token refresh');
				} else {
					throw error(500, 'No Spotify app credentials found');
				}
			}
		} else {
			// No user ID, use default app
			const defaultAppResult = await query(
				'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
				['default']
			);

			if (defaultAppResult.rows.length > 0) {
				clientId = defaultAppResult.rows[0].client_id;
				clientSecret = defaultAppResult.rows[0].client_secret;
				console.log('Using default Spotify app for token refresh (no user ID)');
			} else {
				throw error(500, 'No Spotify app credentials found');
			}
		}
	} catch (dbErr) {
		console.error('Error getting client credentials from database:', dbErr);
		throw error(500, 'Failed to get Spotify client credentials');
	}

	// Now use the client credentials to refresh the token
	try {
		if (!clientId || !clientSecret) {
			throw new Error('Client ID or secret is missing');
		}

		console.log('Refreshing token with client ID:', clientId.substring(0, 5) + '...');

		const response = await fetch(spotifyTokenEndpoint(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
			},
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refreshToken
			})
		});

		if (response.ok) {
			const { access_token, refresh_token } = await response.json();
			console.log('Successfully refreshed access token');

			if (access_token) {
				cookieManager.set(cookies, 'spotifyAccessToken', access_token, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 3600
				});
			} else {
				throw new Error('No access token returned');
			}

			// If we got a new refresh token, update it
			if (refresh_token) {
				cookieManager.set(cookies, 'spotifyRefreshToken', refresh_token, { maxAge: 15552000 }); // 6 months

				// Also update the refresh token in the database
				if (userId) {
					await query(
						`UPDATE clubfindr.users 
						SET refresh_token = $1
						WHERE id = $2`,
						[refresh_token, userId]
					);
				}
			}

			return access_token;
		} else {
			const errorText = await response.text();
			console.error(`Can't get refresh token: ${response.status} - ${errorText}`);
			throw error(500, 'Cannot refresh Spotify access token');
		}
	} catch (refreshErr) {
		console.error('Error in token refresh:', refreshErr);
		throw error(500, 'Failed to refresh access token');
	}
};

export const withAccessToken = async ({
	cookies,
	endpoint,
	request = null // Optional request parameter to get original URL
}: {
	cookies: Cookies;
	endpoint: string;
	request?: Request | null;
}) => {
	let accessToken = cookieManager.get(cookies, 'spotifyAccessToken');
	let tokenRefreshAttempted = false;

	if (!accessToken) {
		console.log('Token expired or missing, fetching new token');
		try {
			accessToken = await fetchAccessToken(cookies);
			tokenRefreshAttempted = true;
		} catch (refreshErr) {
			console.error('Failed to refresh access token:', refreshErr);

			// If we have a request object, get the current URL for return after re-auth
			if (request) {
				const url = new URL(request.url);
				const returnPath = url.pathname + url.search;
				throw redirect(302, `/spotify/reauth?returnTo=${encodeURIComponent(returnPath)}`);
			} else {
				// Fall through to the standard error
				throw error(500, 'Cannot refresh Spotify access token (requires re-authentication)');
			}
		}
	}

	if (!accessToken) {
		throw error(500, 'No access token available');
	}

	try {
		let endpointResponse = await fetchWithAuth(endpoint, accessToken);

		if (!endpointResponse.ok) {
			// If the token is invalid, try refreshing it
			if (endpointResponse.status === 401) {
				console.log('Access token expired, refreshing');

				// Only try refreshing once to avoid loops
				if (!tokenRefreshAttempted) {
					accessToken = await fetchAccessToken(cookies);
					tokenRefreshAttempted = true;

					if (!accessToken) {
						// If refresh fails and we have a request, redirect to re-auth
						if (request) {
							const url = new URL(request.url);
							const returnPath = url.pathname + url.search;
							throw redirect(302, `/spotify/reauth?returnTo=${encodeURIComponent(returnPath)}`);
						} else {
							throw error(500, 'Cannot refresh Spotify access token (requires re-authentication)');
						}
					}

					endpointResponse = await fetchWithAuth(endpoint, accessToken);
				} else {
					// We already tried refreshing, so this is a persistent auth issue
					console.error('Token refresh attempt failed, needs re-authentication');

					// If we have a request object, get the current URL for return after re-auth
					if (request) {
						const url = new URL(request.url);
						const returnPath = url.pathname + url.search;
						throw redirect(302, `/spotify/reauth?returnTo=${encodeURIComponent(returnPath)}`);
					} else {
						throw error(401, 'Spotify authentication expired (requires re-authentication)');
					}
				}
			}
		}

		if (endpointResponse.ok) {
			return await endpointResponse.json();
		}

		const errorText = await endpointResponse.text();
		console.error(`Error on Spotify API call: ${endpointResponse.status} - ${errorText}`);
		// A clear message for the development-mode 403 ("user not registered") and the other
		// known failures, instead of a generic one; callers can show failure.message as it is
		const failure = describeSpotifyFailure(endpointResponse.status, errorText);
		throw error(failure.status, failure.message);
	} catch (apiErr: unknown) {
		// If it's already a redirect or one of our own errors, just rethrow it
		if (apiErr && typeof apiErr === 'object' && 'status' in apiErr && apiErr.status === 302) {
			throw apiErr;
		}
		if (isHttpError(apiErr)) {
			throw apiErr;
		}

		console.error('Error calling Spotify API:', apiErr);
		throw error(500, 'Failed to call Spotify API');
	}
};

export function normalizeCityName(name: string): string {
	if (!name) {
		throw new Error('City name is undefined or null');
	}

	return name.toLowerCase().replace(/\s+/g, '_');
}

export const refreshSpotifyToken = async ({ refreshToken }: { refreshToken: string }) => {
	try {
		// Get default app credentials from database
		const defaultAppResult = await query(
			'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
			['Party Recommender 1']
		);

		if (defaultAppResult.rows.length === 0) {
			console.error('No default Spotify app found');
			return { success: false };
		}

		const clientId = defaultAppResult.rows[0].client_id;
		const clientSecret = defaultAppResult.rows[0].client_secret;

		const response = await fetch(spotifyTokenEndpoint(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
			},
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refreshToken
			})
		});

		if (response.ok) {
			const data = await response.json();
			return { success: true, access_token: data.access_token };
		} else {
			const errorText = await response.text();
			console.error(`Failed to refresh token: ${response.status} - ${errorText}`);
			return { success: false };
		}
	} catch (err) {
		console.error('Error in refreshSpotifyToken:', err);
		return { success: false };
	}
};
