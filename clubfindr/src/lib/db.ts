// $lib/db.ts
import pkg from 'pg';
import { PG_DB, PG_HOST, PG_PASSWORD, PG_PORT, PG_USERNAME } from '$env/static/private';
const { Pool } = pkg;

//import { Pool } from 'pg';

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
