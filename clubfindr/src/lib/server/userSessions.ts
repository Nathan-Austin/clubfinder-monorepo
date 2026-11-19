// Opening a user session (customer or promoter): one row per login, so each device keeps its
// own (KNOWN_ISSUES 95; until 2026-11-19 user_sessions had UNIQUE (user_id) and every login
// replaced the account's one session, logging the other device out). On the way, the account's
// sessions nobody has used for USER_SESSION_MAX_AGE_DAYS are dropped, so a person who logs in
// on many devices over the years does not leave a row per device behind; hooks.server.ts
// expires the ones it meets in between.
import type { Queryable } from '$lib/taste/favouriteArtists';
import { USER_SESSION_MAX_AGE_DAYS } from '$lib/server/promoterAuth';

export async function openUserSession(
	db: Queryable,
	sessionId: string,
	userId: string,
	userCity: string | null,
	now: Date = new Date()
): Promise<void> {
	await db.query(
		`DELETE FROM clubfindr.user_sessions
		  WHERE user_id = $1 AND last_accessed < $2::timestamp - make_interval(days => $3)`,
		[userId, now.toISOString(), USER_SESSION_MAX_AGE_DAYS]
	);
	await db.query(
		`INSERT INTO clubfindr.user_sessions (session_id, user_id, user_city, last_accessed)
		 VALUES ($1, $2, $3, $4)`,
		[sessionId, userId, userCity, now.toISOString()]
	);
}
