// $lib/db.ts
import pkg from 'pg';
import { PG_DB, PG_HOST, PG_PASSWORD, PG_PORT, PG_USERNAME } from '$env/static/private';
const { Pool, types } = pkg;

//import { Pool } from 'pg';

/**
 * Keep Postgres `DATE` columns as the `YYYY-MM-DD` string they are (KNOWN_ISSUES 17).
 *
 * By default node-pg turns OID 1082 (`date`) into a JS `Date` at *server-local* midnight, so
 * `event_date` for 2031-06-21 became 2031-06-20T22:00Z on a server in Germany and serialised
 * to JSON as the previous day. Anything that round-tripped it through `toISOString()` then
 * saved or showed the day before. A calendar date has no time or zone; leaving it a string
 * means nothing can shift it. `$lib/localDate` turns one into a local `Date` for display.
 */
types.setTypeParser(types.builtins.DATE, (value: string) => value);

export const pool = new Pool({
	user: PG_USERNAME,
	password: PG_PASSWORD,
	database: PG_DB,
	host: PG_HOST,
	port: Number(PG_PORT)
});

export async function query(
	text: string,
	params?: (string | number | boolean | null | (string | number)[])[]
): Promise<pkg.QueryResult> {
	const client = await pool.connect();
	try {
		const res = await client.query(text, params);
		return res;
	} catch (err) {
		console.error('Database query error:', err);
		throw err;
	} finally {
		client.release();
	}
}
