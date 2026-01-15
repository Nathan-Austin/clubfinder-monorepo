// This file is responsible for handling the login of bar managers
// route: /login/bars/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { comparePassword } from '$lib/passwordUtils';
import { refreshSpotifyToken } from '$lib/spotifyUtils';
import { decryptToken, encryptToken } from '$lib/encryptionUtils';
import { normalizeCityName } from '$lib/spotifyUtils';
import { cookieManager } from '$lib/cookieManager';
import { SPOTIFY_SERVICE_URL } from '$env/static/private';

export const POST: RequestHandler = async ({ request, cookies }) => {
	console.log('=== Starting login process ===');

	const { email, password } = await request.json();
	console.log('Received login attempt for:', email);

	try {
		// Step 1: Try to authenticate as a regular user or promoter
		const userResult = await query(
			'SELECT id, password_hash, city, role, is_promoter FROM clubfindr.users WHERE general_email = $1',
			[email]
		);

		// Step 2: Try to authenticate as a bar manager with additional fields
		const barManagerResult = await query(
			`SELECT b.id, b.password_hash, b.city, b.name, 
                b.spotify_access_token, b.spotify_refresh_token, b.updated_at, 
                b.spotify_app_name, b.spotify_email, b.music_service
             FROM clubfindr.bars b 
             WHERE b.general_email = $1`,
			[email]
		);

		// If email doesn't exist in either table
		if ((userResult?.rowCount ?? 0) === 0 && (barManagerResult?.rowCount ?? 0) === 0) {
			console.log('User not found:', email);
			return new Response(JSON.stringify({ success: false, message: 'User not found' }), {
				status: 401
			});
		}

		// Check credentials and set appropriate cookies
		let validCredentials = false;
		let isPromoter = false;
		let isBarManager = false;
		let userId = null;
		let normalizedCityName = null;
		let redirectUrl = null;

		// Check user table credentials
		if (userResult?.rowCount > 0) {
			const userData = userResult.rows[0];
			const storedUserPassword = userData.password_hash;
			const isUserPasswordCorrect = await comparePassword(password, storedUserPassword);

			if (isUserPasswordCorrect) {
				console.log('Regular user password correct');
				validCredentials = true;
				userId = userData.id;
				normalizedCityName = normalizeCityName(userData.city);
				isPromoter = userData.is_promoter;

				// Set common cookies
				cookies.set('userId', userId, {
					path: '/',
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				cookies.set('city', normalizedCityName, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				// If user is a promoter, set promoter cookie
				if (isPromoter) {
					cookies.set('promoterId', userId, {
						path: '/',
						secure: true,
						sameSite: 'lax',
						maxAge: 60 * 60 * 24 * 7 // 1 week
					});
				}
			} else {
				console.log('Regular user password incorrect');
			}
		}

		// Check bar manager credentials
		if (barManagerResult?.rowCount > 0) {
			const barData = barManagerResult.rows[0];
			const storedBarPassword = barData.password_hash;
			const isBarPasswordCorrect = await comparePassword(password, storedBarPassword);

			if (isBarPasswordCorrect) {
				console.log('Bar manager password correct');
				validCredentials = true;
				isBarManager = true;
				const barId = barData.id;
				const barName = barData.name;
				normalizedCityName =
					normalizedCityName || (barData.city ? normalizeCityName(barData.city) : '');

				// Variables to track if Spotify authentication is needed
				let needsSpotifyAuth = false;
				let clientId = null;
				let spotifyAppName = barData.spotify_app_name;
				let redirectToSpotify = false;
				let authUrl = '';

				// Set bar manager cookies - ALWAYS set these regardless of Spotify status
				cookies.set('barId', barId, {
					path: '/',
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				cookies.set('bar_email', email, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				cookies.set('barsName', barName, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				cookies.set('bar_city', normalizedCityName, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				// Check if bar uses Spotify and needs authentication
				if (barData.music_service === 'spotify') {
					console.log('Bar uses Spotify as music service');

					// If the bar doesn't have a Spotify app assigned but has a Spotify email,
					// call the Spotify service to assign an app
					if (!spotifyAppName && barData.spotify_email) {
						try {
							console.log('Attempting to assign a Spotify app to bar');
							const spotifyResponse = await fetch(`${SPOTIFY_SERVICE_URL}/add_bar`, {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json'
								},
								body: JSON.stringify({
									bar_id: barId,
									spotify_email: barData.spotify_email
								})
							});

							const spotifyResult = await spotifyResponse.json();

							if (spotifyResult.status && spotifyResult.status === 'success') {
								console.log(`Successfully registered bar ${barId} with Spotify service`);
								spotifyAppName = spotifyResult.app_name;
							} else {
								console.error('Error registering with Spotify service:', spotifyResult);
							}
						} catch (spotifyError) {
							console.error('Exception during Spotify service integration:', spotifyError);
						}
					}

					// If we have an app name, get the client ID for OAuth
					if (spotifyAppName) {
						const appResult = await query(
							'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
							[spotifyAppName]
						);

						if (appResult?.rowCount > 0) {
							clientId = appResult.rows[0].client_id;
							console.log(`Found client ID for app ${spotifyAppName}`);
						} else {
							console.log(`No app found with name: ${spotifyAppName}`);
						}
					} else {
						console.log('Bar has no Spotify app assigned, using default');
						// Try to get default app
						const defaultAppResult = await query(
							'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
							['default']
						);

						if (defaultAppResult?.rowCount > 0) {
							clientId = defaultAppResult.rows[0].client_id;
							spotifyAppName = 'default';
							console.log('Using default Spotify app');
						} else {
							console.error('No default Spotify app found');
						}
					}

					let spotify_access_token = barData.spotify_access_token
						? decryptToken(barData.spotify_access_token)
						: null;
					const spotify_refresh_token = barData.spotify_refresh_token
						? decryptToken(barData.spotify_refresh_token)
						: null;

					console.log(
						'Checking Spotify tokens:',
						`Access token: ${spotify_access_token ? 'exists' : 'missing'}`,
						`Refresh token: ${spotify_refresh_token ? 'exists' : 'missing'}`
					);

					// Check if we should try to use native cookies method instead of cookieManager
					// Right before constructing your response headers
					if (spotify_access_token) {
						console.log('Setting spotifyAccessToken with cookieManager');
						cookieManager.set(cookies, 'spotifyAccessToken', spotify_access_token, {
							path: '/',
							httpOnly: true,
							secure: true,
							sameSite: 'strict',
							maxAge: 60 * 60 // 1 hour
						});
					}

					if (spotify_refresh_token) {
						console.log('Setting spotifyRefreshToken with cookieManager');
						cookieManager.set(cookies, 'spotifyRefreshToken', spotify_refresh_token, {
							path: '/',
							httpOnly: true,
							secure: true,
							sameSite: 'strict',
							maxAge: 15552000 // 6 months
						});
					}

					// AFTER setting the cookies, check if they're set correctly
					console.log('Cookie check after setting:', {
						spotifyAccessTokenCookie: cookies.get('spotifyAccessToken') ? 'exists' : 'missing',
						spotifyRefreshTokenCookie: cookies.get('spotifyRefreshToken') ? 'exists' : 'missing'
					});

					// Now check if tokens exist and determine if auth is needed
					if (!spotify_access_token || !spotify_refresh_token) {
						console.log('Missing Spotify tokens, needs authentication');
						needsSpotifyAuth = true;
						redirectToSpotify = true;
					} else {
						// Check if tokens need refreshing
						const oneHourAgo = new Date(Date.now() - 3600 * 1000);
						if (!barData.updated_at || new Date(barData.updated_at) < oneHourAgo) {
							console.log('Tokens may be expired, attempting to refresh');
							try {
								const newTokenData = await refreshSpotifyToken({
									refreshToken: spotify_refresh_token
								});

								if (newTokenData.success) {
									spotify_access_token = newTokenData.access_token;
									const encryptedNewAccessToken = encryptToken(spotify_access_token);
									await query(
										`UPDATE clubfindr.bars 
										SET spotify_access_token = $1, updated_at = $2
										WHERE id = $3`,
										[encryptedNewAccessToken, new Date().toISOString(), barId]
									);
									console.log('Successfully refreshed Spotify tokens');
								} else {
									console.log('Failed to refresh tokens, needs re-authentication');
									needsSpotifyAuth = true;
									redirectToSpotify = true;
								}
							} catch (refreshError) {
								console.error('Error refreshing Spotify token:', refreshError);
								needsSpotifyAuth = true;
								redirectToSpotify = true;
							}
						}
					}
					console.log('Token cookie debug:', {
						hasAccessToken: !!spotify_access_token,
						needsSpotifyAuth,
						tokenLength: spotify_access_token ? spotify_access_token.length : 0
					});
					console.log('Setting cookies regardless of refresh status');
					if (spotify_access_token) {
						console.log('Setting Spotify access token cookie');
						cookieManager.set(cookies, 'spotifyAccessToken', spotify_access_token, {
							path: '/',
							httpOnly: true,
							secure: true,
							sameSite: 'strict',
							maxAge: 60 * 60 // 1 hour
						});
					}

					if (spotify_refresh_token) {
						console.log('Setting Spotify refresh token cookie');
						cookieManager.set(cookies, 'spotifyRefreshToken', spotify_refresh_token, {
							path: '/',
							httpOnly: true,
							secure: true,
							sameSite: 'strict',
							maxAge: 15552000 // 6 months in seconds
						});
					}
					// Set Spotify tokens if available and valid
					if (spotify_access_token && !needsSpotifyAuth) {
						console.log('Setting valid Spotify tokens in cookies');
						cookieManager.set(cookies, 'spotifyAccessToken', spotify_access_token, {
							path: '/',
							httpOnly: true,
							secure: true,
							sameSite: 'strict',
							maxAge: 60 * 60 // 1 hour
						});

						if (spotify_refresh_token) {
							cookieManager.set(cookies, 'spotifyRefreshToken', spotify_refresh_token, {
								path: '/',
								httpOnly: true,
								secure: true,
								sameSite: 'strict',
								maxAge: 15552000 // 6 months in seconds
							});
						}
					} else {
						// Set a flag that Spotify auth is needed
						console.log('Setting needsSpotifyAuth cookie');
						cookies.set('needsSpotifyAuth', 'true', {
							path: '/',
							secure: true,
							sameSite: 'lax',
							maxAge: 60 * 60 * 24 * 1 // 1 day
						});

						// If Spotify auth is needed and we have a client ID, prepare auth data
						if (needsSpotifyAuth && clientId) {
							console.log('Spotify authentication needed, preparing OAuth flow');

							// Store client ID in a cookie so we can use it on the /bars page
							cookies.set('spotifyClientId', clientId, {
								path: '/',
								httpOnly: false, // Needs to be accessible to client-side JS
								secure: true,
								sameSite: 'lax',
								maxAge: 3600 // 1 hour
							});

							// Also store app name
							cookies.set('spotifyAppName', spotifyAppName, {
								path: '/',
								httpOnly: false, // Needs to be accessible to client-side JS
								secure: true,
								sameSite: 'lax',
								maxAge: 3600 // 1 hour
							});

							// Generate state key for tracking
							const stateKey = Date.now().toString();

							// Prepare data for state storage
							await query(
								'INSERT INTO clubfindr.oauth_states (key, state_data, created_at, expires_at) VALUES ($1, $2, $3, $4)',
								[
									stateKey,
									JSON.stringify({
										source: 'bar-login',
										barId,
										city: normalizedCityName
									}),
									new Date().toISOString(),
									new Date(Date.now() + 3600 * 1000).toISOString() // 1 hour expiry
								]
							);

							// Build the authorization URL
							const redirectUri = encodeURIComponent(
								process.env.VITE_SPOTIFY_REDIRECT_BAR_URI ||
									'https://www.clubfindr.com/spotify/login'
							);

							const scopes = [
								'user-read-playback-state',
								'user-read-currently-playing',
								'playlist-read-private',
								'playlist-read-collaborative',
								'user-read-recently-played',
								'user-top-read',
								'user-library-read',
								'user-read-email',
								'user-read-private'
							].join('%20');

							authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&state=${stateKey}&scope=${scopes}&show_dialog=true`;
						}
					}
				}

				// If we need to redirect to Spotify, do it immediately
				if (redirectToSpotify && authUrl) {
					console.log('=== Sending Spotify redirect response ===', { authUrl });
					return new Response(
						JSON.stringify({
							success: true,
							needsSpotifyAuth: true,
							authUrl: authUrl
						}),
						{
							status: 200
						}
					);
				} else {
					// Otherwise continue to the bars page
					// Otherwise continue to the bars page
					console.log('=== Sending successful login response, redirecting to /bars ===');

					// Create headers and add cookies
					const headers = new Headers();
					headers.append('Content-Type', 'application/json');

					// Get all cookies and explicitly set them in response headers
					const allCookies = cookies.getAll();
					console.log(`Adding ${allCookies.length} cookies to response headers`);

					for (const cookie of allCookies) {
						// Use the serialize method if available, otherwise construct manually
						if (typeof cookie.serialize === 'function') {
							headers.append('Set-Cookie', cookie.serialize());
						} else {
							// Basic cookie serialization
							const cookieValue = `${cookie.name}=${cookie.value}; Path=${cookie.path || '/'}`;
							headers.append('Set-Cookie', cookieValue);
						}
						console.log(`Added cookie to response: ${cookie.name}`);
					}

					return new Response(JSON.stringify({ success: true, redirectUrl: '/bars' }), {
						status: 200,
						headers
					});
				}
			} else {
				console.log('Bar manager password incorrect');
			}
		}

		// Handle role determination and response - this only executes if we haven't returned yet
		if (validCredentials) {
			// Set a cookie if user has dual roles
			if (isPromoter && isBarManager) {
				cookies.set('hasDualRole', 'true', {
					path: '/',
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});
			}

			// Determine where to redirect the user
			// Priority: Bar Manager > Promoter > Regular User
			if (isBarManager) {
				console.log('=== Sending successful login response for bar manager ===');
				return new Response(JSON.stringify({ success: true, redirectUrl: '/bars' }), {
					status: 200
				});
			} else if (isPromoter) {
				console.log('=== Sending successful login response for promoter ===');
				return new Response(JSON.stringify({ success: true, redirectUrl: '/promoter-home' }), {
					status: 200
				});
			} else {
				// Regular user shouldn't be using this login method
				console.log('=== Redirecting regular user to correct login page ===');
				return new Response(
					JSON.stringify({
						success: false,
						message: 'Please use the regular user login',
						redirectUrl: '/login/users'
					}),
					{
						status: 303 // See Other - redirect to different resource
					}
				);
			}
		}

		// Check if it's a regular user trying to use partner login
		const regularUserCheck = await query(
			'SELECT id FROM clubfindr.users WHERE general_email = $1 AND is_promoter = false AND (role IS NULL OR role != $2)',
			[email, 'manager']
		);

		if (regularUserCheck?.rowCount > 0) {
			// This is a regular user trying to use the partner login
			console.log('=== Regular user using partner login, redirecting to user login ===');
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Please use the regular user login',
					redirectUrl: '/login/users'
				}),
				{
					status: 303 // See Other - redirect to different resource
				}
			);
		} else {
			// Truly invalid credentials for partner login
			console.log('=== Invalid credentials ===');
			return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), {
				status: 401
			});
		}
	} catch (error) {
		console.error('Error during login:', error);
		return new Response(JSON.stringify({ success: false, message: 'Error during login' }), {
			status: 500
		});
	}
};
