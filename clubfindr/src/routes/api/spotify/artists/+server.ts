// POST { selectedIds } -> { genresList }: the genres of the artists picked on the guest search
// (/spotify/search), kept in the visitor's `spotify-genres` cookie for /selectedGenres, /clubs
// and /barfindr; GET reads that cookie back. Looks the artists up with the app's
// client-credentials token ($lib/taste/spotifyArtistLookup), never a user's Spotify login.

import { json as svelteJson } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSpotifyId, spotifyAppGet, SpotifyLookupError } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';

// Spotify's several-artists endpoint takes at most 50 ids
const MAX_IDS = 50;
const artistsPath = (ids: string[]) => `/v1/artists?${new URLSearchParams({ ids: ids.join(',') })}`;

// The genres of the caller's last POST, carried per visitor in this cookie (a module-level
// variable here returned whichever user's genres were fetched last, to everyone)
const GENRES_COOKIE = 'spotify-genres';
const GENRES_COOKIE_MAX_AGE = 60 * 60 * 24;

export const GET: RequestHandler = async ({ cookies }) => {
	const stored = cookies.get(GENRES_COOKIE);
	const genresList = stored ? stored.split(',').filter((genre) => genre.length > 0) : [];
	return svelteJson({ genresList });
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Allow-Origin': '*'
		}
	});
};

export const POST: RequestHandler = async ({ cookies, request }) => {
	try {
		const { selectedIds } = await request.json();

		if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
			return svelteJson({ message: 'No valid IDs provided' }, { status: 400 });
		}
		// Only Spotify-shaped ids go into the request URL; duplicates removed, at most 50
		const uniqueIds = [...new Set(selectedIds.filter(isSpotifyId))].slice(0, MAX_IDS);
		if (uniqueIds.length === 0) {
			return svelteJson({ message: 'No valid IDs provided' }, { status: 400 });
		}

		// Initialize genre set
		const genresList: Set<string> = new Set();
		const normalizeGenre = (genre: string) => genre.toLowerCase().trim();

		// Fetch artist data from Spotify
		let data: { artists?: ({ genres?: unknown } | null)[] };
		try {
			data = (await spotifyAppGet(artistsPath(uniqueIds), spotifyLookupOptions())) as typeof data;
		} catch (error) {
			console.warn('Spotify artist lookup failed:', error);
			const status = error instanceof SpotifyLookupError ? error.status : 500;
			return svelteJson({ message: 'Spotify is unavailable right now' }, { status });
		}

		if (!Array.isArray(data.artists)) {
			return svelteJson({ message: 'Invalid response from Spotify API' }, { status: 502 });
		}

		// Process genres (Spotify answers null for an unknown id, and often no genres at all)
		for (const artist of data.artists) {
			const genres = Array.isArray(artist?.genres) ? artist.genres : [];
			for (const genre of genres) {
				if (typeof genre === 'string' && genre.trim()) genresList.add(normalizeGenre(genre));
			}
		}

		const genresArray = Array.from(genresList);
		cookies.set(GENRES_COOKIE, genresArray.join(','), {
			path: '/',
			maxAge: GENRES_COOKIE_MAX_AGE
		});

		// The search cookies /clubs and /barfindr read for a guest search
		cookies.set('genre', genresArray.join(','), {
			path: '/',
			maxAge: 3600
		});

		return svelteJson({
			success: true,
			genresList: genresArray
		});
	} catch (error) {
		console.error('Error handling POST request:', error);
		return svelteJson({ message: 'Error processing request' }, { status: 500 });
	}
};
