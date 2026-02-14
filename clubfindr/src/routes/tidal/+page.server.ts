import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { TidalClient } from '$lib/tidal/client';
import { cookieManager } from '$lib/cookieManager';

async function refreshTidalToken(refreshToken: string, fetch: any) {
	const client_id = import.meta.env.VITE_TIDAL_CLIENT_ID;
	const client_secret = import.meta.env.VITE_TIDAL_CLIENT_SECRET;

	const response = await fetch('https://login.tidal.com/oauth2/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: new URLSearchParams({
			client_id,
			client_secret,
			grant_type: 'refresh_token',
			refresh_token: refreshToken
		}).toString()
	});

	if (!response.ok) {
		throw new Error('Failed to refresh Tidal token');
	}

	return response.json();
}

export const load: PageServerLoad = async ({ cookies, fetch }) => {
	let accessToken = cookieManager.get(cookies, 'tidal_access_token');
	const refreshToken = cookieManager.get(cookies, 'tidal_refresh_token');

	if (!accessToken && refreshToken) {
		try {
			const data = await refreshTidalToken(refreshToken, fetch);
			accessToken = data.access_token;
			cookieManager.set(cookies, 'tidal_access_token', accessToken, {
				maxAge: data.expires_in ? parseInt(data.expires_in) : 3600
			});
			if (data.refresh_token) {
				cookieManager.set(cookies, 'tidal_refresh_token', data.refresh_token, {
					maxAge: 365 * 24 * 60 * 60
				});
			}
		} catch (err) {
			console.error('Tidal refresh failed:', err);
			throw redirect(303, '/api/tidal/auth');
		}
	}

	if (!accessToken) {
		throw redirect(303, '/api/tidal/auth');
	}

	try {
		const client = new TidalClient(accessToken);

		const [artistsRes, tracksRes, playlistsRes] = await Promise.allSettled([
			client.getFavoriteArtists(20),
			client.getFavoriteTracks(20),
			client.getFavoritePlaylists(10)
		]);

		const artists = artistsRes.status === 'fulfilled' ? (artistsRes.value as any).data : [];
		const tracks = tracksRes.status === 'fulfilled' ? (tracksRes.value as any).data : [];
		const playlists = playlistsRes.status === 'fulfilled' ? (playlistsRes.value as any).data : [];

		// Map Tidal data to a common format for the UI
		const topArtists = (artists || []).map((item: any) => ({
			id: item.id,
			username: item.attributes?.name || 'Unknown Artist',
			avatar_url: item.attributes?.imageLinks?.find((img: any) => img.width >= 320)?.href || null,
			artistId: item.id,
			genre: item.attributes?.genres || [],
			tags: []
		}));

		const topTracks = (tracks || []).map((item: any) => ({
			id: item.id,
			title: item.attributes?.title || 'Unknown Track',
			artwork_url: item.attributes?.imageLinks?.find((img: any) => img.width >= 320)?.href || null,
			user: {
				username: item.attributes?.artistName || 'Unknown Artist'
			},
			genre: [],
			tags: []
		}));

		const topPlaylists = (playlists || []).map((item: any) => ({
			id: item.id,
			title: item.attributes?.title || 'Unknown Playlist',
			artwork_url: item.attributes?.imageLinks?.find((img: any) => img.width >= 320)?.href || null,
			user: {
				username: 'Tidal User'
			}
		}));

		return {
			topTracks,
			topArtists,
			topPlaylists,
			debug: {
				artistsCount: topArtists.length,
				tracksCount: topTracks.length,
				playlistsCount: topPlaylists.length
			}
		};
	} catch (err) {
		console.error('Tidal load error:', err);
		throw error(
			500,
			`Failed to load Tidal data: ${err instanceof Error ? err.message : String(err)}`
		);
	}
};
