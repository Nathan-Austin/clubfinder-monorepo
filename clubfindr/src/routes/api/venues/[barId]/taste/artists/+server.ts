// The artists a venue says it plays (ROADMAP section 1, KNOWN_ISSUES 4).
//
//   GET  /api/venues/:barId/taste/artists                    -> { artists, genres }
//   POST /api/venues/:barId/taste/artists {source, sourceId} -> 201 { artist, created, genres }
//
// The venue counterpart of /api/taste/artists: same shape, same catalogue, same genre
// fallback, but the favourites belong to clubfindr.bars rather than a user, so a venue can
// describe itself without connecting Spotify. Open to the venue itself only, by dashboard
// cookie or mobile bearer token ($lib/taste/barSession).

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { canManageBar } from '$lib/taste/barSession';
import {
	addFavouriteArtist,
	FavouriteLimitError,
	isArtistSource,
	isUuid,
	listFavouriteArtists,
	resolveTasteArtist
} from '$lib/taste/favouriteArtists';
import { makeArtistLookup, SpotifyLookupError } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';
import { withGenreFallback } from '$lib/taste/genreFallback';
import { musicbrainzOptions } from '$lib/taste/musicbrainzOptions';
import { lastfmOptions } from '$lib/taste/lastfmOptions';
import { isKnownGenre } from '$lib/taste/genreClassifier';

// Built per request: the Last.fm key and the API hosts are runtime settings
const artistLookup = () =>
	withGenreFallback(makeArtistLookup(spotifyLookupOptions()), {
		classify: isKnownGenre,
		lastfm: lastfmOptions(),
		musicbrainz: musicbrainzOptions()
	});

export const GET: RequestHandler = async ({ cookies, params, request }) => {
	const barId = params.barId;
	if (!isUuid(barId)) return json({ message: 'barId must be a uuid' }, { status: 400 });
	if (!(await canManageBar(pool, barId, { cookies, request }))) {
		return json({ message: 'Not logged in as this venue' }, { status: 403 });
	}

	return json(await listFavouriteArtists(pool, barId, 'bar'));
};

export const POST: RequestHandler = async ({ cookies, params, request }) => {
	const barId = params.barId;
	if (!isUuid(barId)) return json({ message: 'barId must be a uuid' }, { status: 400 });
	if (!(await canManageBar(pool, barId, { cookies, request }))) {
		return json({ message: 'Not logged in as this venue' }, { status: 403 });
	}

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
		const artist = await resolveTasteArtist(pool, source, sourceId, artistLookup());
		const { created } = await addFavouriteArtist(pool, barId, artist.id, 'bar');
		const { genres } = await listFavouriteArtists(pool, barId, 'bar');
		return json({ artist, created, genres }, { status: created ? 201 : 200 });
	} catch (error) {
		if (error instanceof FavouriteLimitError) {
			return json({ message: error.message, limit: error.limit }, { status: 409 });
		}
		if (error instanceof SpotifyLookupError) {
			return json({ message: error.message }, { status: error.status });
		}
		console.error('Error adding venue artist:', error);
		return json({ message: 'Could not add the artist' }, { status: 500 });
	}
};
