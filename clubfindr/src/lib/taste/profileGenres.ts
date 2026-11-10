// The taste profile as the matchers see it: the plain set of genres of the session user's
// favourite artists (docs/taste-profile-design.md). /clubs and /barfindr call this after the
// per-search cookies and the Spotify session genres, so explicit picks always win.

import type { Cookies } from '@sveltejs/kit';
import { listFavouriteArtists, type Queryable } from './favouriteArtists';
import { getSessionUserId, resolveSessionUserId } from './sessionUser';

export async function getProfileGenresForSession(
	db: Queryable,
	sessionId: string | null
): Promise<string[]> {
	const userId = await resolveSessionUserId(db, sessionId);
	if (!userId) return [];
	const { genres } = await listFavouriteArtists(db, userId);
	return genres;
}

/**
 * The profile with how many favourite artists carry each genre, for weighted matching
 * (findWeightedClusters, KNOWN_ISSUES 32). Empty for no session or no favourites.
 */
export async function getProfileGenreWeightsForSession(
	db: Queryable,
	sessionId: string | null
): Promise<Record<string, number>> {
	const userId = await resolveSessionUserId(db, sessionId);
	if (!userId) return {};
	const { genreWeights } = await listFavouriteArtists(db, userId);
	return genreWeights;
}

/**
 * The same profile for an API caller, who may be the app: the web session cookie or the
 * `Authorization: Bearer` token it was given at login (`$lib/taste/sessionUser`). Empty for a
 * caller who is not logged in or has no favourite artists, so a caller that sends its own
 * genres is unaffected.
 */
export async function getProfileGenresForRequest(
	db: Queryable,
	cookies: Cookies,
	request: Request
): Promise<string[]> {
	const userId = await getSessionUserId(cookies, db, request);
	if (!userId) return [];
	const { genres } = await listFavouriteArtists(db, userId);
	return genres;
}

/** As getProfileGenreWeightsForSession, for an API caller (cookie or Bearer token). */
export async function getProfileGenreWeightsForRequest(
	db: Queryable,
	cookies: Cookies,
	request: Request
): Promise<Record<string, number>> {
	const userId = await getSessionUserId(cookies, db, request);
	if (!userId) return {};
	const { genreWeights } = await listFavouriteArtists(db, userId);
	return genreWeights;
}
