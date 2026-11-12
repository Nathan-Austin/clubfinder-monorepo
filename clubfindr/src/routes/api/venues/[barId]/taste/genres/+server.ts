// The genres a venue declares outright (ROADMAP section 1, KNOWN_ISSUES 4).
//
//   GET /api/venues/:barId/taste/genres            -> { genres }
//   PUT /api/venues/:barId/taste/genres {genres}   -> { genres } (replaces the whole set)
//
// The bare-genre counterpart of the venue artist picker: a venue says "we play techno"
// without naming an artist. Only genres the cluster matcher knows are accepted, since a
// declared genre exists solely to be matched. Open to the venue itself only, by dashboard
// cookie or mobile bearer token ($lib/taste/barSession), like the artist endpoints.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { canManageBar } from '$lib/taste/barSession';
import { isUuid } from '$lib/taste/favouriteArtists';
import { isKnownGenre } from '$lib/taste/genreClassifier';
import { DeclaredGenresError, listDeclaredGenres, setDeclaredGenres } from '$lib/taste/venueGenres';

export const GET: RequestHandler = async ({ cookies, params, request }) => {
	const barId = params.barId;
	if (!isUuid(barId)) return json({ message: 'barId must be a uuid' }, { status: 400 });
	if (!(await canManageBar(pool, barId, { cookies, request }))) {
		return json({ message: 'Not logged in as this venue' }, { status: 403 });
	}

	return json({ genres: await listDeclaredGenres(pool, barId) });
};

export const PUT: RequestHandler = async ({ cookies, params, request }) => {
	const barId = params.barId;
	if (!isUuid(barId)) return json({ message: 'barId must be a uuid' }, { status: 400 });
	if (!(await canManageBar(pool, barId, { cookies, request }))) {
		return json({ message: 'Not logged in as this venue' }, { status: 403 });
	}

	let body: { genres?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON body' }, { status: 400 });
	}

	try {
		const genres = await setDeclaredGenres(pool, barId, body.genres, isKnownGenre);
		return json({ genres });
	} catch (error) {
		if (error instanceof DeclaredGenresError) {
			return json({ message: error.message, genres: error.genres }, { status: 400 });
		}
		console.error('Error setting venue genres:', error);
		return json({ message: 'Could not save the genres' }, { status: 500 });
	}
};
