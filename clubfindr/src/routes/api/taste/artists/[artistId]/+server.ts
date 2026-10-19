// DELETE /api/taste/artists/:artistId -> { removed, genres }
// Removes one favourite (the taste_artists id from the list endpoint) from the logged-in user.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import { isUuid, listFavouriteArtists, removeFavouriteArtist } from '$lib/taste/favouriteArtists';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
	const userId = await getSessionUserId(cookies, pool);
	if (!userId) return json({ message: 'Not logged in' }, { status: 401 });

	if (!isUuid(params.artistId)) {
		return json(
			{ message: 'artistId must be the id from GET /api/taste/artists' },
			{ status: 400 }
		);
	}

	try {
		const removed = await removeFavouriteArtist(pool, userId, params.artistId);
		if (!removed) return json({ message: 'Not one of your favourite artists' }, { status: 404 });
		const { genres } = await listFavouriteArtists(pool, userId);
		return json({ removed: true, genres });
	} catch (error) {
		console.error('Error removing favourite artist:', error);
		return json({ message: 'Could not remove the artist' }, { status: 500 });
	}
};
