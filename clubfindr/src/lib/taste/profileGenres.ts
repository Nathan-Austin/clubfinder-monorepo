// The taste profile as the matchers see it: the plain set of genres of the session user's
// favourite artists (docs/taste-profile-design.md). /clubs and /barfindr call this after the
// per-search cookies and the Spotify session genres, so explicit picks always win.

import { listFavouriteArtists, type Queryable } from './favouriteArtists';
import { resolveSessionUserId } from './sessionUser';

export async function getProfileGenresForSession(
	db: Queryable,
	sessionId: string | null
): Promise<string[]> {
	const userId = await resolveSessionUserId(db, sessionId);
	if (!userId) return [];
	const { genres } = await listFavouriteArtists(db, userId);
	return genres;
}
