// $lib/db.ts
import pkg from 'pg';
const { Pool } = pkg;

//import { Pool } from 'pg';

export const pool = new Pool({
	user: import.meta.env.VITE_PG_USERNAME,
	password: import.meta.env.VITE_PG_PASSWORD,
	database: import.meta.env.VITE_PG_DB,
	host: import.meta.env.VITE_PG_HOST,
	port: Number(import.meta.env.VITE_PG_PORT)
});

export async function query(
	text: string,
	params?: (string | number | boolean | null)[]
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
