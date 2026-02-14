import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SoundCloudClient } from '$lib/soundcloud/client';
import { cookieManager } from '$lib/cookieManager';

async function refreshSCtoken(refreshToken: string, fetch: any) {
	const client_id = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;
	const client_secret = import.meta.env.VITE_SOUNDCLOUD_CLIENT_SECRET;

	const response = await fetch('https://secure.soundcloud.com/oauth/token', {
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
		throw new Error('Failed to refresh SoundCloud token');
	}

	return response.json();
}

export const load: PageServerLoad = async ({ cookies, fetch }) => {
	let accessToken = cookieManager.get(cookies, 'soundcloud_access_token');
	const refreshToken = cookieManager.get(cookies, 'soundcloud_refresh_token');
	const clientId = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;

	if (!accessToken && refreshToken) {
		try {
			const data = await refreshSCtoken(refreshToken, fetch);
			accessToken = data.access_token;
			cookieManager.set(cookies, 'soundcloud_access_token', accessToken, {
				maxAge: data.expires_in ? parseInt(data.expires_in) : 3600
			});
			if (data.refresh_token) {
				cookieManager.set(cookies, 'soundcloud_refresh_token', data.refresh_token, {
					maxAge: 365 * 24 * 60 * 60
				});
			}
		} catch (err) {
			console.error('Refresh failed:', err);
			throw redirect(303, '/api/soundcloud/auth');
		}
	}

	if (!accessToken) {
		throw redirect(303, '/api/soundcloud/auth');
	}

	try {
		const client = new SoundCloudClient(accessToken, clientId);

		// 1. Get user profile first to get the ID
		const userMe = await client.getMe();

		// 2. Fetch comprehensive data in parallel
		const [historyResult, activitiesResult, playlistsResult, likesResult] =
			await Promise.allSettled([
				client.getPlayHistory(50),
				client.getRecentActivities(50),
				client.getUserPlaylists(userMe.id, 20),
				client.getLikedTracks(50)
			]);

		const playHistory =
			historyResult.status === 'fulfilled' ? historyResult.value : { collection: [] };
		const userActivities =
			activitiesResult.status === 'fulfilled' ? activitiesResult.value : { collection: [] };
		const userPlaylists =
			playlistsResult.status === 'fulfilled' ? playlistsResult.value : { collection: [] };
		const userLikes = likesResult.status === 'fulfilled' ? likesResult.value : { collection: [] };

		// 3. Extract Recently Played Tracks
		const recentTracks = (playHistory.collection || []).map((item) => item.track).filter(Boolean);

		// 4. Calculate "Top Artists" by aggregating across History, Activities, and Likes
		const artistCounts = new Map();

		const processTrackForArtist = (track: any, weight: number) => {
			if (track?.user) {
				const artistId = track.user.id;
				const current = artistCounts.get(artistId) || {
					...track.user,
					playCount: 0,
					artistId,
					genre: track.genre,
					tag_list: track.tag_list
				};
				current.playCount += weight;

				// Keep track of all genres/tags seen for this artist
				if (track.genre && !current.genre?.includes(track.genre)) {
					current.genre = current.genre ? `${current.genre}, ${track.genre}` : track.genre;
				}
				if (track.tag_list && !current.tag_list?.includes(track.tag_list)) {
					current.tag_list = current.tag_list
						? `${current.tag_list} ${track.tag_list}`
						: track.tag_list;
				}

				artistCounts.set(artistId, current);
			}
		};

		// Weight history more heavily than likes for "Top" calculation
		(playHistory.collection || []).forEach((item) => processTrackForArtist(item.track, 2));
		(userLikes.collection || []).forEach((item) => processTrackForArtist(item.track || item, 1));
		(userActivities.collection || []).forEach((a) => {
			if (a.type === 'track' || a.type === 'track-sharing') {
				processTrackForArtist(a.origin, 1);
			}
		});

		const topArtistsInitial = Array.from(artistCounts.values())
			.sort((a, b) => b.playCount - a.playCount)
			.slice(0, 15);

		// 5. Fetch FULL profiles for the top artists to get their real genres/tags
		const topArtists = await Promise.all(
			topArtistsInitial.map(async (artist) => {
				try {
					const fullProfile = await client.getArtist(artist.artistId);
					return {
						...artist,
						...fullProfile,
						// Ensure we keep our calculated playCount
						playCount: artist.playCount
					};
				} catch (e) {
					return artist;
				}
			})
		);

		// 6. Aggregate tags/genres for debugging/model
		const allGenres = new Set();
		[...recentTracks, ...topArtists].forEach((item) => {
			if (item.genre) allGenres.add(item.genre);
			if (item.tags) {
				const tags = Array.isArray(item.tags) ? item.tags : item.tags.split(' ');
				tags.forEach((t: string) => allGenres.add(t));
			}
		});

		console.log(
			`[SoundCloud Load] Found ${recentTracks.length} recent tracks and ${topArtists.length} top artists.`
		);

		return {
			topTracks: recentTracks.slice(0, 30),
			topArtists,
			topPlaylists: userPlaylists.collection || [],
			recentTracks: userActivities.collection || [],
			debug: {
				likedTracksCount: userLikes.collection?.length || 0,
				recentTracksCount: recentTracks.length,
				playlistsCount: userPlaylists.collection?.length || 0,
				detectedGenres: Array.from(allGenres).slice(0, 10)
			}
		};
	} catch (err) {
		console.error('SoundCloud load error:', err);
		if (err instanceof Error && err.message.includes('401')) {
			throw redirect(303, '/api/soundcloud/auth');
		}
		throw error(
			500,
			`Failed to load SoundCloud data: ${err instanceof Error ? err.message : String(err)}`
		);
	}
};
