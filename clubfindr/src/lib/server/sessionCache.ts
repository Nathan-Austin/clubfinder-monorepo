// The in-memory session cache hooks.server.ts reads before going to the database.
//
// It lives here rather than inside hooks.server.ts so that whatever ends a session can also
// evict it. A cached entry outlives its user_sessions row by up to SESSION_CACHE_TTL, and the
// entry carries the user's name and e-mail, so an endpoint that deletes session rows without
// evicting them would keep serving that person's details to the old session id for minutes.
// One process, one map: fine for the single PM2 instance, as for the rate limiter.

export const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Whatever hooks.server.ts puts in locals.user. Typed by App.Locals rather than restated, so the
 * cache cannot drift from it (note App.Locals still says `id: number`, though users.id is a uuid).
 */
export type CachedSessionUser = NonNullable<App.Locals['user']>;

export const sessionCache = new Map<string, { timestamp: number; user: CachedSessionUser }>();

/** Forgets the given session ids, so the next request re-checks them against the database. */
export function evictSessions(sessionIds: Iterable<string>): void {
	for (const sessionId of sessionIds) sessionCache.delete(sessionId);
}
