// Artist picker onboarding (ROADMAP section 1): a new user names a few artists, and their
// genres seed the taste profile, so results are personalised without any streaming account.
//
// Whether a user is "onboarded" is derived, not stored: a user with at least
// ONBOARDING_MIN_ARTISTS favourite artists has a usable profile, however they got there
// (onboarding, the picker on /, a Last.fm import). No users column, no migration, and nothing
// to backfill for existing users.
//
// ONBOARDING_MAX_ARTISTS only shapes the onboarding step (a quick start). It is advisory: the
// server keeps MAX_FAVOURITE_ARTISTS as the only hard limit, and more artists make a better
// profile, so the step points users to their taste profile to add more.

import type { Queryable } from './favouriteArtists';

export const ONBOARDING_MIN_ARTISTS = 3;
export const ONBOARDING_MAX_ARTISTS = 5;

export async function countFavouriteArtists(db: Queryable, userId: string): Promise<number> {
	const result = await db.query(
		'SELECT count(*)::int AS n FROM clubfindr.user_favourite_artists WHERE user_id = $1',
		[userId]
	);
	const n = Number(result.rows[0]?.n ?? 0);
	return Number.isFinite(n) ? n : 0;
}

/** True when the user has fewer favourites than onboarding asks for. */
export function needsOnboarding(favouriteCount: number): boolean {
	return favouriteCount < ONBOARDING_MIN_ARTISTS;
}
