import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SoundCloudClient } from '$lib/soundcloud/client';
import { cookieManager } from '$lib/cookieManager';
import type { spTrack, spUser } from '$lib/$types';

interface SCTokenResponse {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
}

async function refreshSCtoken(
	refreshToken: string,
	fetchFunc: typeof fetch
): Promise<SCTokenResponse> {
	const client_id = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;
	const client_secret = import.meta.env.VITE_SOUNDCLOUD_CLIENT_SECRET;

	const response = await fetchFunc('https://secure.soundcloud.com/oauth/token', {
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

export const load: PageServerLoad = async ({ cookies, fetch: fetchFunc }) => {
	let accessToken = cookieManager.get(cookies, 'soundcloud_access_token');
	const refreshToken = cookieManager.get(cookies, 'soundcloud_refresh_token');
	const clientId = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;

	if (!accessToken && refreshToken) {
		try {
			const data = await refreshSCtoken(refreshToken, fetchFunc);
			accessToken = data.access_token;
			cookieManager.set(cookies, 'soundcloud_access_token', accessToken, {
				maxAge: data.expires_in
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

		if (!userMe?.id) {
			console.error('[SoundCloud] Failed to get user profile - token may be invalid');
			throw redirect(303, '/api/soundcloud/auth');
		}

		// 2. Fetch data in parallel: likes (public), activities (auth), playlists (public)
		const [likesResult, activitiesResult, playlistsResult] = await Promise.allSettled([
			client.getUserLikes(userMe.id, 50),
			client.getRecentActivities(50),
			client.getUserPlaylists(userMe.id, 20)
		]);

		const userLikes = likesResult.status === 'fulfilled' ? likesResult.value : { collection: [] };
		const userActivities =
			activitiesResult.status === 'fulfilled' ? activitiesResult.value : { collection: [] };
		const userPlaylists =
			playlistsResult.status === 'fulfilled' ? playlistsResult.value : { collection: [] };

		// 3. Top Tracks derived from liked tracks sorted by playback_count
		// v2 /users/{id}/likes wraps items as { track: {...} } or bare tracks
		const likedTracks = (userLikes.collection || [])
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			.map((item: any) => item.track || item)
			.filter((item: spTrack) => item?.title && item?.user) as spTrack[];
		const topTracks = [...likedTracks]
			.sort((a, b) => (b.playback_count || 0) - (a.playback_count || 0))
			.slice(0, 30);

		interface ArtistCount extends spUser {
			playCount: number;
			artistId: number;
			genre?: string | null;
			tag_list?: string;
			description?: string;
		}

		// 4. Calculate "Top Artists" by aggregating across Likes and Activities
		const artistCounts = new Map<number, ArtistCount>();

		const processTrackForArtist = (track: spTrack, weight: number) => {
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

				// Accumulate genres (string, comma-separated)
				if (track.genre && !current.genre?.includes(track.genre)) {
					current.genre = current.genre ? `${current.genre}, ${track.genre}` : track.genre;
				}
				// Accumulate tag_list
				if (track.tag_list && !current.tag_list?.includes(track.tag_list)) {
					current.tag_list = current.tag_list
						? `${current.tag_list} ${track.tag_list}`
						: track.tag_list;
				}

				artistCounts.set(artistId, current);
			}
		};

		// Weight likes more heavily — they represent intentional preference
		likedTracks.forEach((track) => processTrackForArtist(track, 2));
		(userActivities.collection || []).forEach((a) => {
			if ((a.type === 'track' || a.type === 'track-sharing') && a.origin) {
				processTrackForArtist(a.origin, 1);
			}
		});

		const topArtistsInitial = Array.from(artistCounts.values())
			.sort((a, b) => b.playCount - a.playCount)
			.slice(0, 15);

		// 5. Enrich top artists: fetch profile + tracks to get genres/tags
		const topArtists = await Promise.all(
			topArtistsInitial.map(async (artist) => {
				try {
					const [fullProfile, artistTracks] = await Promise.all([
						client.getArtist(artist.artistId),
						client.getUserTracks(artist.artistId, 10)
					]);

					// Collect genres and tags from the artist's tracks
					const trackGenres = new Set<string>();
					const trackTags: string[] = [];
					(artistTracks.collection || []).forEach((track) => {
						if (track.genre) trackGenres.add(track.genre);
						if (track.tag_list) {
							SoundCloudClient.parseTagList(track.tag_list).forEach((t) => trackTags.push(t));
						}
					});

					// Merge: prefer track-derived data over empty profile fields
					const genre = fullProfile.genre || artist.genre || Array.from(trackGenres).join(', ');
					const tagList = fullProfile.tag_list || artist.tag_list || trackTags.join(' ');
					const parsedTags = tagList ? SoundCloudClient.parseTagList(tagList) : [];

					console.log(
						`[SoundCloud] Artist ${fullProfile.username}: genre="${genre}", tags=${parsedTags.length}, trackGenres=${trackGenres.size}`
					);

					return {
						...artist,
						...fullProfile,
						genre: genre || null,
						tag_list: tagList || null,
						tags: parsedTags,
						description: fullProfile.description || artist.description,
						playCount: artist.playCount
					};
				} catch {
					return artist;
				}
			})
		);

		// 6. Aggregate tags/genres for debugging
		const allGenres = new Set<string>();
		[...topTracks, ...topArtists].forEach((item) => {
			if ('genre' in item && item.genre) allGenres.add(item.genre as string);
			if ('tag_list' in item && item.tag_list) {
				SoundCloudClient.parseTagList(item.tag_list as string).forEach((t) => allGenres.add(t));
			}
		});

		console.log(
			`[SoundCloud Load] Found ${topTracks.length} top tracks and ${topArtists.length} top artists.`
		);

		return {
			topTracks,
			topArtists,
			topPlaylists: userPlaylists.collection || [],
			recentTracks: userActivities.collection || [],
			debug: {
				likedTracksCount: likedTracks.length,
				topTracksCount: topTracks.length,
				playlistsCount: userPlaylists.collection?.length || 0,
				detectedGenres: Array.from(allGenres).slice(0, 10)
			}
		};
	} catch (err) {
		console.error('SoundCloud load error:', err);
		if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
			// Clear stale cookies and redirect to re-auth
			cookieManager.set(cookies, 'soundcloud_access_token', '', { maxAge: 0 });
			throw redirect(303, '/api/soundcloud/auth');
		}
		throw error(
			500,
			`Failed to load SoundCloud data: ${err instanceof Error ? err.message : String(err)}`
		);
	}
};
