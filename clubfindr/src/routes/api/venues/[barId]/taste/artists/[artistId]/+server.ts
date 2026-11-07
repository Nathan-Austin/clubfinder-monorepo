// DELETE /api/venues/:barId/taste/artists/:artistId -> { removed, genres }
// Removes one artist (the taste_artists id from the list endpoint) from the venue.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { canManageBar } from '$lib/taste/barSession';
import { isUuid, listFavouriteArtists, removeFavouriteArtist } from '$lib/taste/favouriteArtists';

export const DELETE: RequestHandler = async ({ cookies, params, request }) => {
	const barId = params.barId;
	if (!isUuid(barId)) return json({ message: 'barId must be a uuid' }, { status: 400 });
	if (!(await canManageBar(pool, barId, { cookies, request }))) {
		return json({ message: 'Not logged in as this venue' }, { status: 403 });
	}

	if (!isUuid(params.artistId)) {
		return json(
			{ message: 'artistId must be the id from GET /api/venues/:barId/taste/artists' },
			{ status: 400 }
		);
	}

	try {
		const removed = await removeFavouriteArtist(pool, barId, params.artistId, 'bar');
		if (!removed) return json({ message: 'Not one of this venue’s artists' }, { status: 404 });
		const { genres } = await listFavouriteArtists(pool, barId, 'bar');
		return json({ removed: true, genres });
	} catch (error) {
		console.error('Error removing venue artist:', error);
		return json({ message: 'Could not remove the artist' }, { status: 500 });
	}
};
