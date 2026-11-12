// Seconds until a venue's or promoter's confirmation code expires (negative once it has), for
// SELECT lists on clubfindr.bars, computed in Postgres.
//
// bars.expires_at is `timestamp without time zone`, and every writer stores
// `new Date(...).toISOString()`, so the column holds UTC wall-clock time. node-pg reads such a
// column back as *local* time, so on a server east of UTC (production is in Germany) a fresh
// 10-minute code read as already expired and the resend throttle never applied. Comparing in SQL
// against the UTC wall clock is right whatever the timezone of the Node process or of the
// Postgres session. (users.expires_at and password_resets.expires_at are timestamptz and fine.)
export const BAR_CODE_SECONDS_LEFT_SQL = `EXTRACT(EPOCH FROM (expires_at - (now() AT TIME ZONE 'utc')))::float8`;

/** Whether a code with this many seconds left (from BAR_CODE_SECONDS_LEFT_SQL) is still good. */
export function barCodeStillValid(secondsLeft: number | null | undefined): boolean {
	return typeof secondsLeft === 'number' && secondsLeft > 0;
}
