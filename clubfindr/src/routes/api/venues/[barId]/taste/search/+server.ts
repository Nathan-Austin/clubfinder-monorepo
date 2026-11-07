// GET /api/venues/:barId/taste/search?q=<name> -> { artists: ArtistSearchHit[], warning? }
//
// The venue counterpart of /api/taste/search: the local catalogue plus Spotify's artist
// search with the app's client-credentials token, with `favourite` reflecting the venue's
// own picks. Open to the venue itself only, so this is not a public Spotify proxy.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { canManageBar } from '$lib/taste/barSession';
import {
	isUuid,
	listFavouriteArtists,
	mergeSearchResults,
	searchTasteArtists
} from '$lib/taste/favouriteArtists';
import { searchSpotifyArtists, SpotifyLookupError } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;

export const GET: RequestHandler = async ({ cookies, params, request, url }) => {
	const barId = params.barId;
	if (!isUuid(barId)) return json({ message: 'barId must be a uuid' }, { status: 400 });
	if (!(await canManageBar(pool, barId, { cookies, request }))) {
		return json({ message: 'Not logged in as this venue' }, { status: 403 });
	}

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
			listFavouriteArtists(pool, barId, 'bar')
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
		console.error('Error searching artists for venue:', error);
		return json({ message: 'Artist search failed' }, { status: 500 });
	}
};
