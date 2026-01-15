// src/routes/spotify/login/+page.server.ts
import { VITE_SPOTIFY_REDIRECT_USER_URI, VITE_SPOTIFY_REDIRECT_BAR_URI } from '$env/static/private';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { v4 as uuidv4 } from 'uuid';
import { query } from '$lib/db';
import { getState } from '$lib/tempStore';
import { getStateAsync, removeState } from '$lib/tempStore';
import { cookieManager } from '$lib/cookieManager';
import { encryptToken } from '$lib/encryptionUtils';

export const load: PageServerLoad = async ({ cookies, fetch, url }) => {
	const code = url.searchParams.get('code');
	const stateKey = url.searchParams.get('state');
	const errorParam = url.searchParams.get('error');

	console.log('Spotify login handler called with params:', {
		code: code ? 'exists' : 'missing',
		stateKey: stateKey || 'missing',
		error: errorParam || 'none'
	});

	// If Spotify returned an error, log it and redirect with error message
	if (errorParam) {
		console.error('Error returned from Spotify:', errorParam);
		throw redirect(
			302,
			`/?error=${encodeURIComponent('Spotify authorization failed: ' + errorParam)}`
		);
	}

	if (!stateKey || typeof stateKey !== 'string') {
		console.error('Invalid state returned from OAuth');
		throw redirect(302, `/?error=${encodeURIComponent('Invalid state returned from OAuth')}`);
	}

	let rawStateData = await getStateAsync(stateKey);
	console.log('Raw state data for key', stateKey, ':', rawStateData || 'not found');

	if (!rawStateData || typeof rawStateData !== 'string') {
		console.error('State data not found or has expired');
		throw redirect(302, `/?error=${encodeURIComponent('State data not found or has expired')}`);
	}

	let stateData;
	try {
		stateData = JSON.parse(rawStateData);
		console.log('Parsed state data:', stateData);
	} catch (err) {
		console.error('Failed to parse state data:', err);
		throw redirect(302, `/?error=${encodeURIComponent('Invalid state data format')}`);
	}

	// Improved source detection - check for a source flag in the state data
	const isFromUserHome = stateData.source === 'user-home';
	const isFromBarLogin = stateData.source === 'bar-login';

	console.log('Auth source detection:', {
		isFromUserHome,
		isFromBarLogin,
		stateSource: stateData.source || 'not set',
		stateData
	});

	const sessionId = cookieManager.get(cookies, 'sessionId');

	if (!code) {
		console.error('No code returned from Spotify');
		throw redirect(302, `/?error=${encodeURIComponent('No code returned from Spotify')}`);
	}

	try {
		// Determine client ID and secret based on the source (user or bar)
		let clientId, clientSecret;
		let userId = null;
		let barId = null;

		// Begin transaction
		await query('BEGIN');

		// Handle bar authentication flow
		if (isFromBarLogin && stateData.barId) {
			barId = stateData.barId;
			console.log('Bar login flow detected with barId:', barId);

			// Get the bar's Spotify app details
			const barResult = await query(
				`SELECT spotify_app_name
				FROM clubfindr.bars
				WHERE id = $1`,
				[barId]
			);

			if (barResult.rows.length > 0) {
				const spotifyAppName = barResult.rows[0].spotify_app_name;

				if (spotifyAppName) {
					// Get app credentials
					const appCredentials = await query(
						`SELECT client_id, client_secret 
						FROM clubfindr.spotify_apps 
						WHERE app_name = $1`,
						[spotifyAppName]
					);

					if (appCredentials.rows.length > 0) {
						clientId = appCredentials.rows[0].client_id;
						clientSecret = appCredentials.rows[0].client_secret;
						console.log('Using bar-specific Spotify app:', spotifyAppName);
					} else {
						console.error('No credentials found for app:', spotifyAppName);
						// Fallback to default app
						const defaultAppResult = await query(
							'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
							['default']
						);

						if (defaultAppResult.rows.length > 0) {
							clientId = defaultAppResult.rows[0].client_id;
							clientSecret = defaultAppResult.rows[0].client_secret;
							console.log('Falling back to default Spotify app for bar');
						} else {
							throw error(500, 'No Spotify app credentials found');
						}
					}
				} else {
					console.error('Bar has no Spotify app assigned');
					// Use default app
					const defaultAppResult = await query(
						'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
						['default']
					);

					if (defaultAppResult.rows.length > 0) {
						clientId = defaultAppResult.rows[0].client_id;
						clientSecret = defaultAppResult.rows[0].client_secret;
						console.log('Using default Spotify app for bar');
					} else {
						throw error(500, 'No Spotify app credentials found');
					}
				}
			} else {
				console.error('Bar not found with ID:', barId);
				throw error(404, 'Bar not found');
			}
		} else {
			// Regular user flow
			if (sessionId) {
				// If we have a session ID, get user ID from the session
				const sessionResult = await query(
					'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1',
					[sessionId]
				);

				if (sessionResult.rows.length > 0) {
					userId = sessionResult.rows[0].user_id;
					console.log('Found user ID from session:', userId);

					// Get the user's app details
					const userAppResult = await query(
						`SELECT sa.client_id, sa.client_secret 
						FROM clubfindr.users u
						JOIN clubfindr.spotify_apps sa ON u.spotify_app_name = sa.app_name
						WHERE u.id = $1`,
						[userId]
					);

					if (userAppResult.rows.length > 0) {
						clientId = userAppResult.rows[0].client_id;
						clientSecret = userAppResult.rows[0].client_secret;
						console.log('Using user-specific Spotify app');
					} else {
						// If no app is assigned to the user, get a default app
						const defaultAppResult = await query(
							'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
							['default']
						);

						if (defaultAppResult.rows.length > 0) {
							clientId = defaultAppResult.rows[0].client_id;
							clientSecret = defaultAppResult.rows[0].client_secret;
							console.log('Using default Spotify app');
						} else {
							throw error(500, 'No Spotify app credentials found');
						}
					}
				} else {
					console.log('Session ID found but no matching user_id');
					// Session not found, fallback to default app
					const defaultAppResult = await query(
						'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
						['default']
					);

					if (defaultAppResult.rows.length > 0) {
						clientId = defaultAppResult.rows[0].client_id;
						clientSecret = defaultAppResult.rows[0].client_secret;
						console.log('Using default Spotify app');
					} else {
						throw error(500, 'No Spotify app credentials found');
					}
				}
			} else {
				console.log('No session ID found, using default app');
				// No session ID, use default app
				const defaultAppResult = await query(
					'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
					['default']
				);

				if (defaultAppResult.rows.length > 0) {
					clientId = defaultAppResult.rows[0].client_id;
					clientSecret = defaultAppResult.rows[0].client_secret;
				} else {
					throw error(500, 'No Spotify app credentials found');
				}
			}
		}

		// Determine correct redirect URI based on the source
		const redirectUri = isFromBarLogin
			? VITE_SPOTIFY_REDIRECT_BAR_URI
			: VITE_SPOTIFY_REDIRECT_USER_URI;

		console.log('Using redirect URI for token exchange:', redirectUri);

		// Exchange the code for tokens
		const tokenBody = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri
		});

		console.log('Token exchange parameters:', {
			code: code.substring(0, 10) + '...', // Show beginning for debugging without revealing full code
			redirect_uri: redirectUri,
			clientId: clientId.substring(0, 5) + '...' // Just show beginning of client ID
		});

		/** Fetch Spotify Tokens **/
		const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: tokenBody
		});

		if (!tokenResponse.ok) {
			const errorText = await tokenResponse.text();
			console.error(`Failed to fetch Spotify token: ${tokenResponse.status} - ${errorText}`);
			throw redirect(
				302,
				`/?error=${encodeURIComponent('Failed to fetch Spotify token: ' + tokenResponse.status)}`
			);
		}

		const tokenData = await tokenResponse.json();
		console.log('Token response received with keys:', Object.keys(tokenData));

		const { access_token, refresh_token } = tokenData;

		if (!access_token) {
			console.error('Spotify did not return an access token');
			throw redirect(
				302,
				`/?error=${encodeURIComponent('Spotify authentication failed: No access token')}`
			);
		}

		/** Fetch Spotify User Profile **/
		console.log('Fetching user profile from Spotify');
		const userProfileResponse = await fetch('https://api.spotify.com/v1/me', {
			headers: {
				Authorization: `Bearer ${access_token}`
			}
		});

		if (!userProfileResponse.ok) {
			const profileError = await userProfileResponse.text();
			console.error(
				`Failed to fetch user profile: ${userProfileResponse.status} - ${profileError}`
			);
			throw redirect(302, `/?error=${encodeURIComponent('Failed to fetch Spotify profile')}`);
		}

		const userProfile = await userProfileResponse.json();
		console.log('User profile received:', {
			id: userProfile.id,
			email: userProfile.email ? 'exists' : 'missing'
		});

		// Handle bar login flow
		if (isFromBarLogin && barId) {
			console.log('Updating bar with Spotify info');

			// Update bar with Spotify tokens
			await query(
				`UPDATE clubfindr.bars 
				SET 
				  spotify_access_token = $1,
				  spotify_refresh_token = $2,
				  updated_at = NOW()
				WHERE id = $3`,
				[encryptToken(access_token), encryptToken(refresh_token || ''), barId]
			);

			// Set cookies for bar
			cookieManager.set(cookies, 'spotifyAccessToken', access_token, {
				maxAge: 3600 // 1 hour
			});

			if (refresh_token) {
				cookieManager.set(cookies, 'spotifyRefreshToken', refresh_token, {
					maxAge: 15552000 // 6 months
				});
			} else {
				console.warn('No refresh token returned for bar');
			}

			/** Commit Transaction **/
			await query('COMMIT');
			console.log('Bar transaction committed successfully');

			// Redirect to bars page
			throw redirect(302, `/bars`);
		}
		// Regular user flow from here on
		else if (isFromUserHome && userId) {
			console.log('Updating existing user with Spotify info');
			// Update the user's Spotify information
			await query(
				`UPDATE clubfindr.users 
				SET 
					spotify_user_id = $1,
					spotify_email = $2,
					access_token = $3,
					refresh_token = $4
				WHERE id = $5`,
				[userProfile.id, userProfile.email || null, access_token, refresh_token || null, userId]
			);

			// Update user session
			await query(
				`UPDATE clubfindr.user_sessions
				SET 
					access_token = $1,
					refresh_token = $2,
					last_accessed = NOW()
				WHERE session_id = $3`,
				[access_token, refresh_token || null, sessionId]
			);
		} else {
			// Handle new user or non-user-home flow
			if (!userId) {
				console.log('No user ID found, checking if Spotify user exists');
				// Check if user exists by Spotify ID
				const existingSpotifyUser = await query(
					`SELECT id FROM clubfindr.users WHERE spotify_user_id = $1`,
					[userProfile.id]
				);

				if (existingSpotifyUser.rows.length > 0) {
					// User exists, update tokens
					userId = existingSpotifyUser.rows[0].id;
					console.log('Existing Spotify user found with ID:', userId);

					await query(
						`UPDATE clubfindr.users 
						SET access_token = $1, refresh_token = $2
						WHERE id = $3`,
						[access_token, refresh_token || null, userId]
					);
				} else {
					console.log('Creating new user from Spotify login');
					// Create new user
					const appName = 'default'; // Use default app for new users
					const userResult = await query(
						`INSERT INTO clubfindr.users (
							general_email, 
							spotify_email, 
							password_hash, 
							spotify_user_id, 
							city, 
							role, 
							access_token, 
							refresh_token, 
							spotify_app_name
						) VALUES ($1, $2, 'temp', $3, $4, 'user', $5, $6, $7)
						RETURNING id`,
						[
							userProfile.email || `${userProfile.id}@spotify.com`,
							userProfile.email || null,
							userProfile.id,
							stateData.city.toLowerCase(),
							access_token,
							refresh_token,
							appName
						]
					);

					if (userResult.rows.length === 0) {
						console.error('User was not inserted due to a conflict or issue.');
					} else {
						console.log('User inserted with id:', userResult.rows[0].id);
						userId = userResult.rows[0].id;
					}
				}
			}

			// Create new session ID if needed
			const newSessionId = sessionId || uuidv4();
			console.log('Using session ID:', newSessionId, 'New?', !sessionId);

			// Update or create user session
			await query(
				`
				INSERT INTO clubfindr.user_sessions (user_id, user_city, session_id, access_token, refresh_token)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (user_id) DO UPDATE 
				SET 
					session_id = EXCLUDED.session_id,
					access_token = EXCLUDED.access_token,
					refresh_token = EXCLUDED.refresh_token,
					last_accessed = NOW();
				`,
				[userId, stateData.city.toLowerCase(), newSessionId, access_token, refresh_token || null]
			);

			// Set session ID cookie if it's new
			if (!sessionId) {
				cookieManager.set(cookies, 'sessionId', newSessionId, {
					path: '/',
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'lax',
					maxAge: 15552000 // 6 months, same as userId
				});
				console.log('Set userClientId cookie with value:', clientId);
			}
			cookies.set('isLoggedIn', 'true', {
				path: '/',
				httpOnly: false, // Make it accessible to client-side JS
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 15552000 // 6 months
			});

			// Check profile completion status
			const userProfileStatus = await query(
				`SELECT password_hash, role FROM clubfindr.users WHERE id = $1`,
				[userId]
			);

			const isProfileComplete = userProfileStatus.rows[0].password_hash !== 'temp';
			console.log('Profile completion status:', isProfileComplete);

			cookies.set('profileComplete', isProfileComplete ? 'true' : 'false', {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}

		console.log('Setting common cookies for user flow');
		// Set common cookies for user flow (not for bar flow)
		if (!isFromBarLogin) {
			if (access_token) {
				cookieManager.set(cookies, 'spotifyAccessToken', access_token, {
					maxAge: 3600 // 1 hour
				});
			} else {
				console.warn('No access token available to store in cookie');
			}

			if (refresh_token) {
				cookieManager.set(cookies, 'spotifyRefreshToken', refresh_token, {
					maxAge: 15552000 // 6 months
				});
			} else {
				console.warn('No refresh token returned');
			}

			// City cookie
			if (stateData?.city) {
				cookies.set('city', stateData.city, {
					path: '/',
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'lax',
					maxAge: 3600 // 1 hour
				});
			}

			// Date cookie
			if (stateData?.formattedDate) {
				cookies.set('date', stateData.formattedDate, {
					path: '/',
					httpOnly: true,
					secure: process.env.NODE_ENV === 'production',
					sameSite: 'lax',
					maxAge: 3600 // 1 hour
				});
			}

			// Set user ID cookie
			cookieManager.set(cookies, 'usersId', userId, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 15552000 // 6 months
			});
		}

		/** Commit Transaction **/
		await query('COMMIT');
		console.log('Transaction committed successfully');

		/** Redirect based on origin */
		if (isFromBarLogin) {
			console.log('Redirecting to /bars');
			throw redirect(302, `/bars`);
		} else {
			console.log('Redirecting to /spotify');
			throw redirect(302, `/spotify`);
		}
	} catch (err) {
		console.error('An error occurred during Spotify authentication process:', err);
		await query('ROLLBACK');

		// If it's already a redirect, just rethrow it
		if (err.status === 302) {
			throw err;
		}

		// Otherwise, redirect to error page
		throw redirect(302, `/?error=${encodeURIComponent('Spotify authentication failed')}`);
	}
};
