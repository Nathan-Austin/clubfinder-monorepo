// bars/+page.server.ts
// This file handles the server-side logic for the bars page in a SvelteKit application.

import type { PageServerLoad } from '../$types';
import type { Track, RecentlyPlayedTrack } from '$lib/$types';
import { cookieManager } from '$lib/cookieManager';
import { query } from '$lib/db';
import { decryptToken, encryptToken } from '$lib/encryptionUtils';
import { redirect } from '@sveltejs/kit';

const currentlyPlayingEndpoint = `https://api.spotify.com/v1/me/player/currently-playing`;
const queueEndpoint = `https://api.spotify.com/v1/me/player/queue`;
const recentlyPlayedEndpoint = `https://api.spotify.com/v1/me/player/recently-played`;
const userPlaylistsEndpoint = `https://api.spotify.com/v1/me/playlists`;
const userTopArtistsEndpoint = `https://api.spotify.com/v1/me/top/artists`;
const refreshTokenEndpoint = `https://accounts.spotify.com/api/token`;
const artistsEndpoint = (ids: string[]) =>
	`https://api.spotify.com/v1/artists?ids=${ids.join(',')}`;

/**
 * Refreshes the Spotify access token using bar-specific client credentials
 * @param refreshToken The refresh token to use
 * @param cookies The cookies object from the request context
 * @returns The new access token or null if refresh failed
 */
async function refreshAccessToken(
	refreshToken: string,
	cookies: import('@sveltejs/kit').Cookies
): Promise<string | null> {
	try {
		// Get the bar's email from cookies
		const barEmail = cookies.get('bar_email');

		if (!barEmail) {
			console.error('Bar email not found in cookies');
			return null;
		}

		// Query the bars table to get the spotify_app_name and refresh token
		const barResult = await query(
			'SELECT spotify_app_name, spotify_refresh_token FROM clubfindr.bars WHERE general_email = $1',
			[barEmail]
		);

		if (!barResult?.rows?.length) {
			console.error(`No bar found with email: ${barEmail}`);
			return null;
		}

		const spotifyAppName = barResult.rows[0].spotify_app_name;
		// Get the encrypted refresh token from the database
		const encryptedRefreshToken = barResult.rows[0].spotify_refresh_token;

		if (!spotifyAppName) {
			console.error(`No Spotify app associated with bar email: ${barEmail}`);
			return null;
		}

		if (!encryptedRefreshToken) {
			console.error(`No refresh token found for bar email: ${barEmail}`);
			return null;
		}

		// Decrypt the refresh token from the database
		const decryptedRefreshToken = decryptToken(encryptedRefreshToken);
		console.log(`Decrypted refresh token length: ${decryptedRefreshToken.length}`);

		// Query the spotify_apps table to get the client ID and secret
		const appResult = await query(
			'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
			[spotifyAppName]
		);

		if (!appResult?.rows?.length) {
			console.error(`No Spotify app found with name: ${spotifyAppName}`);
			return null;
		}

		const clientId = appResult.rows[0].client_id;
		// Use the client secret directly as it's not encrypted
		const clientSecret = appResult.rows[0].client_secret;

		if (!clientId || !clientSecret) {
			console.error('Missing client ID or secret for app:', spotifyAppName);
			return null;
		}

		console.log(`Using credentials for app: ${spotifyAppName}`);
		console.log(
			`Client ID length: ${clientId.length}, Client Secret length: ${clientSecret.length}`
		);

		// Make the token refresh request with the bar-specific credentials
		const response = await fetch(refreshTokenEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`
			},
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: decryptedRefreshToken // Use the decrypted refresh token
			})
		});

		if (response.ok) {
			const data = await response.json();

			// Update the bar's access token in the database
			const encryptedAccessToken = encryptToken(data.access_token);
			await query(
				`UPDATE clubfindr.bars 
                 SET spotify_access_token = $1, updated_at = $2
                 WHERE general_email = $3`,
				[encryptedAccessToken, new Date().toISOString(), barEmail]
			);

			console.log(`Successfully refreshed token for ${barEmail} using app ${spotifyAppName}`);
			return data.access_token;
		}

		if (!response.ok) {
			console.error(`Failed to refresh access token: ${response.status} ${response.statusText}`);

			try {
				const errorText = await response.text();
				console.error('Error details:', errorText);

				// Check if it's an invalid grant error (expired refresh token)
				if (errorText.includes('invalid_grant') || response.status === 400) {
					console.log('Refresh token appears to be expired, needs re-authentication');

					// Clear the invalid tokens from cookies
					cookieManager.set(cookies, 'spotifyAccessToken', '', {
						path: '/',
						maxAge: 0 // Expire immediately
					});

					cookieManager.set(cookies, 'spotifyRefreshToken', '', {
						path: '/',
						maxAge: 0 // Expire immediately
					});
				}
			} catch {
				console.error('Could not read error details');
			}

			return null;
		}

		return null;
	} catch (error) {
		console.error('Error in refreshAccessToken:', error);
		return null;
	}
}

async function withAccessToken({
	cookies,
	endpoint,
	retry = true
}: {
	cookies: import('@sveltejs/kit').Cookies;
	endpoint: string;
	retry?: boolean;
}) {
	let accessToken = cookieManager.get(cookies, 'spotifyAccessToken');
	const refreshToken = cookieManager.get(cookies, 'spotifyRefreshToken');

	if (!accessToken) {
		console.error('No access token available');
		return null;
	}

	try {
		let response = await fetch(endpoint, {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		});

		if (response.status === 401 && refreshToken && retry) {
			console.log('Access token expired, attempting refresh');
			const newAccessToken = await refreshAccessToken(refreshToken, cookies);

			if (newAccessToken) {
				console.log('Token refresh successful');
				// Save new access token in cookies
				cookieManager.set(cookies, 'spotifyAccessToken', newAccessToken, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'strict',
					maxAge: 60 * 60 // 1 hour
				});
				accessToken = newAccessToken;

				// Retry the original request with the new access token
				response = await fetch(endpoint, {
					headers: {
						Authorization: `Bearer ${accessToken}`
					}
				});
			} else {
				console.log('Token refresh failed, authentication required');
				return null;
			}
		}

		if (!response.ok) {
			console.error(`Error fetching from ${endpoint}: ${response.status} ${response.statusText}`);
			return null;
		}

		const text = await response.text();

		// Handle the case where the response is empty
		if (!text) {
			console.warn(`Empty response from ${endpoint}`);
			return {}; // Return a default empty object
		}

		try {
			return JSON.parse(text);
		} catch (error) {
			console.error(`Failed to parse JSON from ${endpoint}:`, error);
			return null;
		}
	} catch (error) {
		console.error(`Error in API request to ${endpoint}:`, error);
		return null;
	}
}

// Update to your export const load: PageServerLoad function
export const load: PageServerLoad = async ({ cookies, url }) => {
	try {
		// Check if the access and refresh tokens are available
		const accessToken = cookieManager.get(cookies, 'spotifyAccessToken');
		const refreshToken = cookieManager.get(cookies, 'spotifyRefreshToken');
		const barId = cookies.get('barId');

		// Verify that we have a barId cookie (needed for auth)
		if (!barId) {
			console.error('Missing barId cookie - user may not be properly logged in');
			// Redirect to login page
			throw redirect(302, '/login/bars');
		}

		const barName = cookies.get('barsName');

		if (!accessToken || !refreshToken) {
			// No tokens - user needs to authenticate
			console.log('Missing Spotify tokens - redirecting to auth');

			// First, check if we need to get the client ID from DB
			const barResult = await query('SELECT spotify_app_name FROM clubfindr.bars WHERE id = $1', [
				barId
			]);

			let clientId = null;
			let spotifyAppName = null;

			if (barResult?.rows?.length) {
				spotifyAppName = barResult.rows[0].spotify_app_name;

				if (spotifyAppName) {
					const appResult = await query(
						'SELECT client_id FROM clubfindr.spotify_apps WHERE app_name = $1',
						[spotifyAppName]
					);

					if (appResult?.rows?.length) {
						clientId = appResult.rows[0].client_id;
					}
				}
			}

			if (!clientId) {
				// Try to get default app if no app is assigned
				const defaultAppResult = await query(
					'SELECT client_id FROM clubfindr.spotify_apps WHERE app_name = $1',
					['default']
				);

				if (defaultAppResult?.rows?.length) {
					clientId = defaultAppResult.rows[0].client_id;
					spotifyAppName = 'default';
				}
			}

			if (clientId) {
				// Store client ID in cookies for the reauth process
				cookies.set('spotifyClientId', clientId, {
					path: '/',
					httpOnly: false,
					secure: true,
					sameSite: 'lax',
					maxAge: 3600 // 1 hour
				});

				if (spotifyAppName) {
					cookies.set('spotifyAppName', spotifyAppName, {
						path: '/',
						httpOnly: false,
						secure: true,
						sameSite: 'lax',
						maxAge: 3600 // 1 hour
					});
				}
			}

			const returnUrl = url.pathname + url.search;
			return {
				loggedOut: true,
				authUrl: `/spotify/reauth?returnTo=${encodeURIComponent(returnUrl)}`,
				barName: barName || 'Your Bar'
			};
		}
		// Test the tokens with a simple API call before doing all the other calls
		const testResponse = await withAccessToken({
			cookies,
			endpoint: 'https://api.spotify.com/v1/me',
			retry: true
		});

		// If we get a null response after retry, it means token refresh failed
		if (testResponse === null) {
			console.log(
				'Token validation failed even after refresh attempt - user needs to reauthenticate'
			);
			const returnUrl = url.pathname + url.search;
			return {
				loggedOut: true,
				authUrl: `/spotify/reauth?returnTo=${encodeURIComponent(returnUrl)}`,
				barName: barName || 'Your Bar'
			};
		}

		// If we got here, token is valid (either original or refreshed)
		console.log('Spotify token is valid, proceeding with API calls');

		// If we have tokens, try to fetch Spotify data
		try {
			const [currentPlaying, queueData, recentlyPlayed, playlistsData, topArtistsData] =
				await Promise.all([
					withAccessToken({
						cookies,
						endpoint: currentlyPlayingEndpoint,
						retry: true
					}),
					withAccessToken({
						cookies,
						endpoint: queueEndpoint,
						retry: true
					}),
					withAccessToken({
						cookies,
						endpoint: recentlyPlayedEndpoint,
						retry: true
					}),
					withAccessToken({
						cookies,
						endpoint: userPlaylistsEndpoint,
						retry: true
					}),
					withAccessToken({
						cookies,
						endpoint: userTopArtistsEndpoint,
						retry: true
					})
				]);

			// Check if any of the API calls failed with auth errors
			if (
				[currentPlaying, queueData, recentlyPlayed, playlistsData, topArtistsData].some(
					(result) => result === null
				)
			) {
				console.log('Some API calls failed, likely auth issues');

				// Check if this is potentially an authentication issue
				if (!cookies.get('spotifyAccessToken') || !cookies.get('spotifyRefreshToken')) {
					const returnUrl = url.pathname + url.search;
					return {
						loggedOut: true,
						authUrl: `/spotify/reauth?returnTo=${encodeURIComponent(returnUrl)}`,
						barName
					};
				}
			}

			let nextTracks: Track[] = [];

			// Simply use the queue method directly since it's reliable for your use case
			if (queueData?.queue && queueData.queue.length > 0) {
				// Use the queue data directly
				nextTracks = queueData.queue.slice(0, 5);
				console.log(`Found ${nextTracks.length} tracks in queue`);
			} else if (currentPlaying?.context?.type === 'playlist' && currentPlaying.item) {
				// Only try the playlist method as a fallback if queue is empty
				const playlistId = currentPlaying.context.uri.split(':').pop();
				if (playlistId) {
					try {
						const playlistTracksData = await withAccessToken({
							cookies,
							endpoint: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`
						});

						if (playlistTracksData?.items) {
							const currentTrackIndex = playlistTracksData.items.findIndex(
								(item: { track: Track }) => item.track.id === currentPlaying.item.id
							);
							if (currentTrackIndex >= 0) {
								nextTracks = playlistTracksData.items
									.slice(currentTrackIndex + 1, currentTrackIndex + 11)
									.map((item: { track: Track }) => item.track)
									.filter((track: Track) => track !== undefined);
							}
						}
					} catch {
						console.log(
							`Falling back to empty nextTracks as both queue and playlist methods failed`
						);
						nextTracks = [];
					}
				}
			} else {
				// No queue or playlist context
				nextTracks = [];
			}

			// Extract artist IDs from recently played tracks for genre analysis
			const artistIds = new Set<string>();

			if (recentlyPlayed?.items) {
				recentlyPlayed.items.forEach((item: { track: RecentlyPlayedTrack }) => {
					if (item.track?.artists) {
						item.track.artists.forEach((artist: { id: string }) => {
							artistIds.add(artist.id);
						});
					}
				});
			}

			// Limit to 50 artist IDs (Spotify API max)
			const limitedArtistIds = Array.from(artistIds).slice(0, 50);

			// Fetch artist details (including genres)
			const genreCounts: { [genre: string]: number } = {};
			if (limitedArtistIds.length > 0) {
				const artistData = await withAccessToken({
					cookies,
					endpoint: artistsEndpoint(limitedArtistIds)
				});

				if (artistData?.artists) {
					artistData.artists.forEach((artist: { genres: string[] }) => {
						artist.genres.forEach((genre) => {
							genreCounts[genre] = (genreCounts[genre] || 0) + 1;
						});
					});
				}
			}

			const commonGenres = Object.entries(genreCounts)
				.map(([genre, count]) => ({ genre, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);

			// Return the successfully loaded data
			return {
				currentlyPlaying: (currentPlaying?.item as Track) || null,
				queue: queueData?.queue || [],
				nextTracks: nextTracks || [],
				recentlyPlayedTracks:
					recentlyPlayed?.items?.map((i: { track: RecentlyPlayedTrack }) => i.track) || [],
				playlists: playlistsData?.items || [],
				topArtists: topArtistsData?.items || [],
				loggedOut: false,
				barName,
				commonGenres,
				barId: cookies.get('barId')
			};
		} catch (apiError: unknown) {
			// If it's a 401/403 error, we need to reauth
			const apiErrorStatus =
				apiError && typeof apiError === 'object' && 'status' in apiError
					? (apiError as { status: number }).status
					: undefined;
			if (apiErrorStatus === 401 || apiErrorStatus === 403) {
				const returnUrl = url.pathname + url.search;
				throw redirect(302, `/spotify/reauth?returnTo=${encodeURIComponent(returnUrl)}`);
			}

			// For other errors, log them and return an error state
			console.error('API error in bar page load:', apiError);
			return {
				error: 'Failed to load Spotify data. Please try reconnecting.',
				loggedOut: false,
				barName
			};
		}
	} catch (err: unknown) {
		// If it's a redirect, just pass it through
		if (err && typeof err === 'object' && 'status' in err && err.status === 302) {
			throw err;
		}

		console.error('Error in GET handler', err);
		return {
			message: 'An unexpected error occurred',
			error: err instanceof Error ? err.message : 'Unknown error'
		};
	}
};
