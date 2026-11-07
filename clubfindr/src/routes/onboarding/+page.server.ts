// Artist picker onboarding (ROADMAP section 1). New accounts land here after signup
// (/login/users answers newAccount: true); anyone can come back with ?edit.
//
// Completion is derived from the favourite count (src/lib/taste/onboarding.ts): users who
// already have enough artists go straight on to /users-home, unless they asked to edit.

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import { countFavouriteArtists } from '$lib/taste/favouriteArtists';
import {
	needsOnboarding,
	ONBOARDING_MAX_ARTISTS,
	ONBOARDING_MIN_ARTISTS
} from '$lib/taste/onboarding';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const userId = await getSessionUserId(cookies, pool);
	if (!userId) redirect(303, '/login/users');

	const favouriteCount = await countFavouriteArtists(pool, userId);
	const editing = url.searchParams.has('edit');
	if (!editing && !needsOnboarding(favouriteCount)) redirect(303, '/users-home');

	return {
		favouriteCount,
		min: ONBOARDING_MIN_ARTISTS,
		max: ONBOARDING_MAX_ARTISTS
	};
};
