// bars/+page.server.ts
// The venue dashboard: its events, the artists it says it plays and its declared genres.
// None of it needs a streaming account. The venue's own Spotify connection (currently
// playing, queue, playlists, top artists) was retired with ROADMAP section 1; production had
// run without it since SPOTIFY_CONNECT_ENABLED=false (2026-11-12).

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { listFavouriteArtists } from '$lib/taste/favouriteArtists';
import { listDeclaredGenres } from '$lib/taste/venueGenres';
import { pool } from '$lib/db';

export const load: PageServerLoad = async ({ cookies }) => {
	const barId = cookies.get('barId');

	// The barId cookie is what the dashboard's own calls authenticate with
	if (!barId) {
		console.error('Missing barId cookie - user may not be properly logged in');
		throw redirect(302, '/login/bars');
	}

	const barName = cookies.get('barsName') || 'Your Bar';

	// `barId` goes into every return, so the events section never posts to /api/bars//events
	// (KNOWN_ISSUES 4). A failure to read the taste profile still leaves a working dashboard.
	try {
		const venueArtists = await listFavouriteArtists(pool, barId, 'bar');
		const declaredGenres = await listDeclaredGenres(pool, barId);
		return {
			barId,
			barName,
			venueArtists: venueArtists.artists,
			venueGenres: venueArtists.genres,
			declaredGenres
		};
	} catch (tasteError) {
		console.error('Could not load the venue taste profile:', tasteError);
		return {
			barId,
			barName,
			venueArtists: [],
			venueGenres: [],
			declaredGenres: [] as string[],
			error: 'Could not load the artists and genres you play.'
		};
	}
};
