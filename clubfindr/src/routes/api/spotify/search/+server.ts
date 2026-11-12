// GET /api/spotify/search?q=<text> -> { tracks: { items: TrackHit[] } }
//
// Track search for the promoter dashboard's track picker (TrackSearch.svelte). Uses the app's
// client-credentials token, like the artist picker's search, so no Spotify user login is
// involved: it used to need the caller's own Spotify OAuth cookies, which promoters never had,
// so it failed for them. Only for a logged-in user or a promoter, so this is not an open
// Spotify proxy. Promoters log in through /login/bars, which writes no user_sessions row, so
// they are recognised by the same `promoterId` cookie /promoter-home trusts (a plain cookie;
// hardening it is ROADMAP section 4). The response keeps the `tracks.items` shape TrackSearch
// already reads.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import { isUuid } from '$lib/taste/favouriteArtists';
import { searchSpotifyTracks, SpotifyLookupError } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';

const MAX_QUERY_LENGTH = 100;

async function isPromoter(promoterId: string | undefined): Promise<boolean> {
	if (!isUuid(promoterId)) return false;
	const result = await pool.query(
		'SELECT 1 FROM clubfindr.users WHERE id = $1 AND is_promoter = true',
		[promoterId]
	);
	return (result.rowCount ?? 0) > 0;
}

export const GET: RequestHandler = async ({ cookies, request, url }) => {
	const allowed =
		(await getSessionUserId(cookies, pool, request)) !== null ||
		(await isPromoter(cookies.get('promoterId')));
	if (!allowed) return json({ error: 'Not logged in' }, { status: 401 });

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
