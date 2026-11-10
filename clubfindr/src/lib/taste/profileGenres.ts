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
