// Favourite artists of the logged-in user (manual taste profile, step 1).
//
//   GET  /api/taste/artists                -> { artists, genres }
//   POST /api/taste/artists {source, sourceId} -> 201 { artist, created, genres }
//
// The artist's genres come from the provider (Spotify, client credentials) the first time
// it is added and are stored in clubfindr.taste_artists, so listing and matching never call
// the provider. See docs/taste-profile-design.md.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import {
	addFavouriteArtist,
	FavouriteLimitError,
	isArtistSource,
	listFavouriteArtists,
	resolveTasteArtist
} from '$lib/taste/favouriteArtists';
import { makeArtistLookup, SpotifyLookupError } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';

const lookup = makeArtistLookup(spotifyLookupOptions());

export const GET: RequestHandler = async ({ cookies }) => {
	const userId = await getSessionUserId(cookies, pool);
	if (!userId) return json({ message: 'Not logged in' }, { status: 401 });

	return json(await listFavouriteArtists(pool, userId));
};

export const POST: RequestHandler = async ({ cookies, request }) => {
	const userId = await getSessionUserId(cookies, pool);
	if (!userId) return json({ message: 'Not logged in' }, { status: 401 });

	let body: { source?: unknown; sourceId?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON body' }, { status: 400 });
	}

	const source = body.source ?? 'spotify';
	const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
	if (!isArtistSource(source)) {
		return json({ message: 'Unknown artist source' }, { status: 400 });
	}
	if (!sourceId || sourceId.length > 100) {
		return json({ message: 'sourceId is required' }, { status: 400 });
	}

	try {
		const artist = await resolveTasteArtist(pool, source, sourceId, lookup);
		const { created } = await addFavouriteArtist(pool, userId, artist.id);
		const { genres } = await listFavouriteArtists(pool, userId);
		return json({ artist, created, genres }, { status: created ? 201 : 200 });
	} catch (error) {
		if (error instanceof FavouriteLimitError) {
			return json({ message: error.message, limit: error.limit }, { status: 409 });
		}
		if (error instanceof SpotifyLookupError) {
			return json({ message: error.message }, { status: error.status });
		}
		console.error('Error adding favourite artist:', error);
		return json({ message: 'Could not add the artist' }, { status: 500 });
	}
};
