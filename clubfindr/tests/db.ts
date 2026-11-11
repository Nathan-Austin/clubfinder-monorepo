// Direct access to the dev database, for e2e tests whose outcome has no HTTP read path — a
// deleted account, say, which by design can no longer be logged into to look at.
//
// Reads the connection from clubfindr/.env, the file dev/setup.sh writes, and parses it rather
// than loading it, so nothing leaks into process.env. Like dev/setup.sh it refuses any database
// but clubfindr_dev on port 54329: these helpers write and delete rows, and must never be able
// to reach anything else, whatever .env happens to contain.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import pg from 'pg';

const DEV_DB = 'clubfindr_dev';
const DEV_PORT = '54329';

function devConfig() {
	const env = parseEnv(readFileSync(path.join(import.meta.dirname, '..', '.env'), 'utf8'));
	if (env.PG_DB !== DEV_DB || env.PG_PORT !== DEV_PORT) {
		throw new Error(
			`tests/db.ts only talks to ${DEV_DB} on port ${DEV_PORT}; .env names ` +
				`${env.PG_DB ?? '(none)'} on ${env.PG_PORT ?? '(none)'}. Run dev/setup.sh.`
		);
	}
	return {
		host: env.PG_HOST,
		port: Number(env.PG_PORT),
		database: env.PG_DB,
		user: env.PG_USERNAME,
		password: env.PG_PASSWORD
	};
}

/** Runs one parameterised statement against the dev database on a short-lived connection. */
export async function devQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
	text: string,
	params: unknown[] = []
): Promise<T[]> {
	const client = new pg.Client(devConfig());
	await client.connect();
	try {
		return (await client.query<T>(text, params)).rows;
	} finally {
		await client.end();
	}
}
