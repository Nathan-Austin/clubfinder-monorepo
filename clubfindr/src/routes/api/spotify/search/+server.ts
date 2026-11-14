// GET /api/spotify/search?q=<text> -> { tracks: { items: TrackHit[] } }
//
// Track search for the promoter dashboard's track picker (TrackSearch.svelte). Uses the app's
// client-credentials token, like the artist picker's search, so no Spotify user login is
// involved: it used to need the caller's own Spotify OAuth cookies, which promoters never had,
// so it failed for them. Only for a logged-in user or a promoter, so this is not an open
// Spotify proxy: both hold a user_sessions row (promoters since 2026-11-14, when /login/bars
// stopped relying on the plain `promoterId` cookie this endpoint also used to accept;
// KNOWN_ISSUES 51). The response keeps the `tracks.items` shape TrackSearch already reads.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import { searchSpotifyTracks, SpotifyLookupError } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';

const MAX_QUERY_LENGTH = 100;

export const GET: RequestHandler = async ({ cookies, request, url }) => {
	if ((await getSessionUserId(cookies, pool, request)) === null) {
		return json({ error: 'Not logged in' }, { status: 401 });
	}

	const query = (url.searchParams.get('q') ?? '').trim();
	if (!query || query.length > MAX_QUERY_LENGTH) {
		return json({ error: `q must be 1 to ${MAX_QUERY_LENGTH} characters` }, { status: 400 });
	}
	const type = url.searchParams.get('type') ?? 'track';
	if (type !== 'track') {
		return json({ error: 'Only type=track is supported' }, { status: 400 });
	}

	try {
		const items = await searchSpotifyTracks(query, spotifyLookupOptions());
		return json({ tracks: { items } });
	} catch (error) {
		console.warn('Spotify track search failed:', error);
		const status = error instanceof SpotifyLookupError ? error.status : 500;
		return json({ error: 'Failed to search Spotify' }, { status });
	}
};
