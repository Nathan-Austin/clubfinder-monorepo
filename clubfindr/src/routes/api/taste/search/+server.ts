// GET /api/taste/search?q=<name> -> { artists: ArtistSearchHit[], warning? }
//
// Artist search for the favourite-artist picker. Combines the local catalogue
// (taste_artists, works offline) with Spotify's artist search using the app's
// client-credentials token, the same search the guest "Artist or song…" path uses, so no
// Spotify user login is involved. When Spotify cannot be reached the catalogue hits are still
// returned, with a warning. Logged-in users only, so this is not an open Spotify proxy.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import {
	listFavouriteArtists,
	mergeSearchResults,
	searchTasteArtists
} from '$lib/taste/favouriteArtists';
import { searchSpotifyArtists, SpotifyLookupError } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;

export const GET: RequestHandler = async ({ cookies, url }) => {
	const userId = await getSessionUserId(cookies, pool);
	if (!userId) return json({ message: 'Not logged in' }, { status: 401 });

	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
		return json(
			{ message: `q must be ${MIN_QUERY_LENGTH} to ${MAX_QUERY_LENGTH} characters` },
			{ status: 400 }
		);
	}

	try {
		const [catalogue, profile] = await Promise.all([
			searchTasteArtists(pool, query),
			listFavouriteArtists(pool, userId)
		]);
		const favouriteIds = new Set(profile.artists.map((artist) => artist.id));

		let warning: string | undefined;
		let provider: Awaited<ReturnType<typeof searchSpotifyArtists>> = [];
		try {
			provider = await searchSpotifyArtists(query, spotifyLookupOptions());
		} catch (error) {
			warning =
				error instanceof SpotifyLookupError
					? 'Spotify search is unavailable right now; showing saved artists only.'
					: 'Artist search is partly unavailable; showing saved artists only.';
			console.warn('Spotify artist search failed:', error);
		}

		const artists = mergeSearchResults(catalogue, provider, favouriteIds);
		return json(warning ? { artists, warning } : { artists });
	} catch (error) {
		console.error('Error searching artists:', error);
		return json({ message: 'Artist search failed' }, { status: 500 });
	}
};
