/* eslint-disable @typescript-eslint/no-explicit-any */
// The guest "Artist or song…" search from the home page (the `search` cookie /storestate
// sets). Uses the app's client-credentials token through $lib/taste/spotifyArtistLookup, the
// one server-side Spotify app: no user login, no token in a cookie (it used to share the
// per-user `spotifyAccessToken` cookie and log the token on every search), and the hosts follow
// SPOTIFY_API_BASE / SPOTIFY_ACCOUNTS_BASE, so the e2e suite runs it against the mock.
import type { Artist_search, Track } from '$lib/$types';
import { spotifyAppGet } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';

const MAX_QUERY_LENGTH = 100;

const searchPath = (query: string) =>
	`/v1/search?${new URLSearchParams({ q: query, type: 'artist,track' })}`;

export const load = async ({ cookies }) => {
	const stored = cookies.get('search');
	const searchQuery = (stored ?? '').trim().slice(0, MAX_QUERY_LENGTH);

	if (stored && !searchQuery) {
		return {
			props: { artists: [], tracks: [], message: 'Please enter a valid search query.' }
		};
	}
	if (!searchQuery) {
		return {
			props: {
				artists: [],
				tracks: [],
				message: 'Your search session has expired. Please enter a new search query.'
			}
		};
	}

	let spotifyData: Data;
	try {
		spotifyData = (await spotifyAppGet(searchPath(searchQuery), spotifyLookupOptions())) as Data;
	} catch (error) {
		console.warn('Guest Spotify search failed:', error);
		return {
			props: {
				artists: [],
				tracks: [],
				message: 'Spotify search is unavailable right now. Please try again in a moment.'
			}
		};
	}

	return {
		props: {
			artists: mapToArtist(spotifyData),
			tracks: mapToTrack(spotifyData)
		}
	};
};

type Data = {
	artists: {
		items: {
			genres: string[];
			id: string;
			images: {
				height: number;
				url: string;
				width: number;
			}[];
			name: string;
			external_urls: { spotify: string }; // Spotify link for the artist
		}[];
	};
	tracks: {
		items: {
			preview_url: any;
			uri: any;
			id: string;
			name: string;
			album: {
				id: any;
				name: string;
				images: {
					url: string;
					height: number;
					width: number;
				}[];
				external_urls: { spotify: string }; // Spotify link for the album
			};
			artists: {
				external_urls: any;
				id: string;
				name: string;
			}[];
			external_urls: { spotify: string }; // Spotify link for the track
		}[];
	};
};

function mapToArtist(data: Data): Artist_search[] {
	return (data.artists?.items ?? []).map((item) => {
		return {
			genres: item.genres ?? [],
			id: item.id,
			images: (item.images ?? []).map((image) => {
				return {
					url: image.url,
					height: image.height,
					width: image.width
				};
			}),
			name: item.name,
			spotifyLink: `https://open.spotify.com/artist/${item.id}` // Adding Spotify link
		};
	});
}

function mapToTrack(data: Data): Track[] {
	return (data.tracks?.items ?? []).map((item) => ({
		id: item.id,
		name: item.name,
		artists: item.artists.map((artist) => ({
			id: artist.id,
			name: artist.name,
			external_urls: { spotify: artist.external_urls?.spotify ?? '' }
		})),
		album: {
			id: item.album.id,
			name: item.album.name,
			images: (item.album.images ?? []).map((image) => ({
				url: image.url,
				height: image.height,
				width: image.width
			})),
			external_urls: { spotify: item.album.external_urls?.spotify ?? '' }
		},
		preview_url: item.preview_url,
		uri: item.uri,
		external_urls: { spotify: item.external_urls?.spotify ?? '' }
	}));
}
