import { afterAll, describe, expect, it, vi } from 'vitest';
import pkg from 'pg';

// $lib/db builds a Pool at import time; it never connects here, but it needs the settings.
vi.mock('$env/static/private', () => ({
	PG_USERNAME: 'test',
	PG_PASSWORD: 'test',
	PG_DB: 'test',
	PG_HOST: '127.0.0.1',
	PG_PORT: '5432'
}));

/**
 * KNOWN_ISSUES 17: node-pg turns a Postgres `DATE` into a JS `Date` at server-local midnight,
 * which serialises to the previous day's 22:00Z/23:00Z in a zone east of UTC. Importing
 * $lib/db must leave DATE columns as the `YYYY-MM-DD` text Postgres sent.
 */
const DATE_OID = pkg.types.builtins.DATE; // 1082

const originalTz = process.env.TZ;
afterAll(() => {
	if (originalTz === undefined) delete process.env.TZ;
	else process.env.TZ = originalTz;
});

describe('the DATE type parser $lib/db installs', () => {
	it('keeps a DATE column as the YYYY-MM-DD string Postgres sent', async () => {
		await import('./db');
		const parse = pkg.types.getTypeParser(DATE_OID);
		expect(parse('2031-06-21')).toBe('2031-06-21');
	});

	it('does not shift the day in a zone east of UTC, where the default did', async () => {
		process.env.TZ = 'Europe/Berlin'; // where the production server runs
		await import('./db');
		const parse = pkg.types.getTypeParser(DATE_OID);

		// What the app now sends on: the calendar date itself, unchanged by JSON
		expect(JSON.parse(JSON.stringify({ event_date: parse('2031-06-21') }))).toEqual({
			event_date: '2031-06-21'
		});

		// What it used to send: local midnight, which JSON renders as the day before
		const asDate = new Date(2031, 5, 21);
		expect(asDate.toISOString().startsWith('2031-06-20')).toBe(true);
	});
});
