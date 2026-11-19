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
	try {
		await db.query(
			`INSERT INTO clubfindr.user_sessions (session_id, user_id, user_city, last_accessed)
			 VALUES ($1, $2, $3, $4)`,
			[sessionId, userId, userCity, now.toISOString()]
		);
	} catch (error) {
		// A database still carrying the old UNIQUE (user_id) (the migration not applied yet, or
		// a dev database rebuilt from an older schema): fall back to the one-session rule rather
		// than answer 500 to a good login, and say so once per process
		if (!isUniqueUserIdViolation(error)) throw error;
		warnOnce();
		await db.query(
			`UPDATE clubfindr.user_sessions
			    SET session_id = $1, user_city = $2, last_accessed = $3, genres = NULL,
			        created_at = CURRENT_TIMESTAMP
			  WHERE user_id = $4`,
			[sessionId, userCity, now.toISOString(), userId]
		);
	}
}

function isUniqueUserIdViolation(error: unknown): boolean {
	const pgError = error as { code?: unknown; constraint?: unknown } | undefined;
	return pgError?.code === '23505' && pgError?.constraint === 'unique_user_id';
}

let warned = false;
function warnOnce() {
	if (warned) return;
	warned = true;
	console.warn(
		'user_sessions still has UNIQUE (user_id): apply migrations/20261119_user_sessions_many_per_user.sql; one session per account until then'
	);
}
