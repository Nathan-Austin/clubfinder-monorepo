import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from '../$types';
import { withAccessToken } from '$lib/spotifyUtils';
import { VITE_SPOTIFY_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_SPOTIFY_CLIENT_ID } from '$env/static/public';
import { Buffer } from 'buffer';
import { query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';
const client_id = PUBLIC_SPOTIFY_CLIENT_ID;
const client_secret = VITE_SPOTIFY_CLIENT_SECRET;

const token_endpoint = `https://accounts.spotify.com/api/token`;

import type {
	Playlist,
	Artist,
	RecentlyPlayedTrack,
	PlaylistTracks,
	PlaylistWithArtists
} from '$lib/$types';

const recentlyPlayedEndpoint = `https://api.spotify.com/v1/me/player/recently-played`;
const userPlaylistsEndpoint = `https://api.spotify.com/v1/me/playlists`;
const userTopArtistsEndpoint = `https://api.spotify.com/v1/me/top/artists`;

export const load = (async ({ cookies }) => {
	const now = Date.now();
	// Read tokens and expiry from cookies
	const accessToken = cookieManager.get(cookies, 'spotifyAccessToken');
	const refresh_token = cookieManager.get(cookies, 'spotifyRefreshToken');
	const tokenExpiryString = cookies.get('spotifyTokenExpiry'); // Leave regular cookie
	const tokenExpiry = tokenExpiryString ? parseInt(tokenExpiryString, 10) : null;

	// Initial check for profile completeness from cookies
	let profileComplete = cookies.get('profileComplete') === 'true';
	const sessionId = cookieManager.get(cookies, 'sessionId');

	if (!sessionId) {
		throw error(401, 'Session ID not found');
	}

	// Only check the database if profileComplete is not already true
	if (!profileComplete) {
		try {
			// Query the database for the password hash based on sessionId
			const userProfileStatus = await query(
				`SELECT u.password_hash
			 FROM clubfindr.users u
			 JOIN clubfindr.user_sessions us
			   ON u.id = us.user_id
			 WHERE us.session_id = $1;`,
				[sessionId]
			);

			if (userProfileStatus.rowCount === 0) {
				throw error(404, 'User not found');
			}

			// Determine if the profile is complete based on password hash
			const isPasswordSet = userProfileStatus.rows[0].password_hash !== 'temp';
			profileComplete = isPasswordSet;

			// Update the profileComplete cookie
			cookies.set('profileComplete', String(profileComplete), {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 60 * 60 // 1 hour
			});
		} catch (err) {
			console.error('Error fetching user profile status:', err);
			throw error(500, 'Internal server error');
		}
	}

	// Handle token refresh
	if (!accessToken || !tokenExpiry || now >= tokenExpiry) {
		console.log('Token expired or missing, fetching new token');

		if (!refresh_token) {
			throw error(401, 'No refresh token available. Please log in again.');
		}

		try {
			// Base64 encode the client ID and secret
			const encodedString = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

			// Fetch a new access token using the refresh token
			const response = await fetch(token_endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Authorization: `Basic ${encodedString}`
				},
				body: new URLSearchParams({
					grant_type: 'refresh_token',
					refresh_token
				})
			});

			const data = await response.json();

			if (response.status === 400 && data.error === 'invalid_grant') {
				console.error('Invalid refresh token, clearing cookies and asking user to log in again');
				// Clear the cookies
				cookies.delete('spotifyAccessToken', { path: '/' });
				cookies.delete('spotifyRefreshToken', { path: '/' });
				cookies.delete('spotifyTokenExpiry', { path: '/' });
				throw redirect(302, '/login'); // Redirect the user to login
			}

			// Set the new access token and its expiry time
			const newAccessToken = data.access_token;
			const newRefreshToken = data.refresh_token || refresh_token; // Keep old refresh token if new one isn't provided
			const newTokenExpiry = now + data.expires_in * 1000; // Expiry in ms

			// Set the new tokens in cookies
			cookieManager.set(cookies, 'spotifyAccessToken', newAccessToken, {
				maxAge: data.expires_in // Ensure the cookie lasts as long as the token is valid
			});
			cookieManager.set(cookies, 'spotifyRefreshToken', newRefreshToken, {
				maxAge: 60 * 60 * 24 * 30 // 30 days for the refresh token
			});
			cookies.set('spotifyTokenExpiry', newTokenExpiry.toString(), {
				path: '/',
				httpOnly: true,
				secure: true,
				maxAge: data.expires_in
			});
		} catch (err) {
			console.error('Error refreshing Spotify token:', err);
			throw error(500, 'Unable to refresh Spotify token');
		}
	}

	try {
		const [tracks, PlaylistsData, TopArtistsData] = await Promise.all([
			withAccessToken({ cookies, endpoint: recentlyPlayedEndpoint }),
			withAccessToken({ cookies, endpoint: userPlaylistsEndpoint }),
			withAccessToken({ cookies, endpoint: userTopArtistsEndpoint })
		]);

		const allPlaylistTracks: PlaylistTracks[] = await Promise.all(
			PlaylistsData.items.map((playlist: Playlist) =>
				withAccessToken({ cookies, endpoint: playlist.tracks.href })
			)
		);

		const playlistArtistIds = [] as Array<string[]>;
		allPlaylistTracks.forEach((pt) => {
			const artistsInPlaylist = new Set<string>();
			// Filter out null/undefined tracks first
			const validTracks = pt.items.filter((item) => item?.track);

			validTracks.forEach((ptt) => {
				ptt.track.artists?.forEach((artist) => {
					if (artist?.id) {
						artistsInPlaylist.add(artist.id);
					}
				});
			});

			playlistArtistIds.push([...artistsInPlaylist]);
		});

		// Return the data for rendering
		return {
			recentlyPlayedTracks: tracks.items.map((i: { track: RecentlyPlayedTrack }) => ({
				...i.track,
				spotifyLink: i.track.album
					? i.track.album.external_urls.spotify
					: i.track.external_urls?.spotify
			})),
			playlists: (PlaylistsData as { items: Playlist[] }).items.map((item, i) => ({
				...item,
				artistIds: playlistArtistIds[i],
				spotifyLink: item.external_urls // Add Spotify link to playlists
			})) as PlaylistWithArtists[],
			topArtists: TopArtistsData.items.map((artist: Artist) => ({
				...artist,
				spotifyLink: artist.external_urls // Add Spotify link to artists
			})) as Artist[],
			profileComplete
		};
	} catch (err) {
		console.error('Error in GET handler', err);
		return { message: err instanceof Error ? err.message : 'An unexpected error occurred' };
	}
}) satisfies PageServerLoad;
