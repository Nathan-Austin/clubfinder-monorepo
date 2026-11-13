// Seconds until a venue's or promoter's confirmation code expires (negative once it has), for
// SELECT lists on clubfindr.bars, computed in Postgres.
//
// bars.expires_at used to be `timestamp without time zone` holding UTC wall-clock time (every
// writer stores toISOString()), which node-pg read back as *local* time: on a server east of UTC
// (production is in Germany) a fresh code looked expired and the resend throttle never applied
// (d25f205). migrations/20261113_bars_expires_at_timestamptz.sql makes it timestamptz; computing
// the difference in SQL keeps the check independent of the Node process's timezone either way.
export const BAR_CODE_SECONDS_LEFT_SQL = `EXTRACT(EPOCH FROM (expires_at - now()))::float8`;

/** Whether a code with this many seconds left (from BAR_CODE_SECONDS_LEFT_SQL) is still good. */
export function barCodeStillValid(secondsLeft: number | null | undefined): boolean {
	return typeof secondsLeft === 'number' && secondsLeft > 0;
}
