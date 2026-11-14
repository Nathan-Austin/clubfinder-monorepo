import { test, expect, testPassword } from './fixtures';
import { devQuery } from './db';

// Multi-statement writes run in one transaction on one connection (KNOWN_ISSUES 39).
//
// They used to be query('BEGIN') … query('COMMIT') through $lib/db's query(), which takes a
// pooled connection per statement, so BEGIN went back to the pool still open. Any early return or
// error between the two left that connection "idle in transaction" for the next, unrelated request
// to inherit. Postgres reports that state itself, so these tests ask it directly.
//
// The stranded-transaction check is decisive when this file runs on its own (it failed with one
// stranded transaction against the old code), but in the full parallel suite another request can
// pick the connection up first and close the leak by accident — which is also how it hid in
// production. It can then miss a regression, never invent one. The deterministic guard is
// src/lib/server/no-pooled-transactions.test.ts, which rejects the pattern in source.

const PASSWORD = testPassword();
const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/**
 * Connections that have sat inside an open transaction for over two seconds. A real transaction
 * here lasts milliseconds; one left open by a leak stays that way until the connection is reused.
 */
async function strandedTransactions(): Promise<number> {
	const [row] = await devQuery<{ n: string }>(
		`SELECT count(*) AS n FROM pg_stat_activity
		  WHERE datname = current_database()
		    AND state LIKE 'idle in transaction%'
		    AND now() - state_change > interval '2 seconds'`
	);
	return Number(row.n);
}

test('a promoter registration commits its user and its venue together', async ({ page }) => {
	const verified = await page.request.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'mock-captcha-ok' }
	});
	expect(verified.status()).toBe(200);

	const email = `${unique('tx-promoter')}@clubfindr.test`;
	const response = await page.request.post('/register/promoter', {
		data: {
			businessName: unique('Transaction Promoter'),
			contactPerson: 'Transaction Test',
			email,
			phone: '+49 30 1234567',
			address: 'Teststrasse 3',
			postcode: '10115',
			cityName: 'Berlin',
			website: '',
			password: PASSWORD
		}
	});
	expect(response.status(), await response.text()).toBe(200);
	expect(await response.json()).toMatchObject({ success: true });

	// Both rows, linked: the venue belongs to the user the same transaction created
	const rows = await devQuery<{ is_promoter: boolean; linked: boolean }>(
		`SELECT u.is_promoter, b.user_id = u.id AS linked
		   FROM clubfindr.users u JOIN clubfindr.bars b ON b.general_email = u.general_email
		  WHERE u.general_email = $1`,
		[email]
	);
	expect(rows).toEqual([{ is_promoter: true, linked: true }]);
});

test('a promoter registration that fails half-way rolls back and leaves no transaction open', async ({
	page
}) => {
	// The user and promoters rows go in first, then the venue's INSERT fails. The whole
	// transaction must roll back on its own connection: no user or promoters row left behind, and
	// nothing "idle in transaction" for an unrelated request to inherit (KNOWN_ISSUES 39). This
	// took over from the Spotify-registration test when that endpoint was retired.
	//
	// What makes the venue INSERT fail is a trigger this test adds for the duration, matching only
	// its own e-mail prefix, so no other spec's registrations are touched. Input validation
	// (ROADMAP section 4) now refuses every bad value the test used to send to get there (a null
	// business name, then a NUL byte; KNOWN_ISSUES 64) with a 400 before the transaction starts.
	await installFailingVenueTrigger();
	const verified = await page.request.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'mock-captcha-ok' }
	});
	expect(verified.status()).toBe(200);

	const email = `${unique('tx-promoter-fail')}@clubfindr.test`;
	// Removed in this test's own finally, as soon as the request is answered: a file-wide
	// afterEach would let another test of this file, finishing first in a parallel worker, drop
	// the trigger while this one still needs it
	const response = await page.request
		.post('/register/promoter', {
			data: {
				businessName: unique('Transaction Venue'),
				contactPerson: 'Transaction Test',
				email,
				phone: '+49 30 1234567',
				address: 'Teststrasse 4',
				postcode: '10115',
				cityName: 'Berlin',
				website: '',
				password: PASSWORD
			}
		})
		.finally(removeFailingVenueTrigger);
	expect(response.status()).toBe(500);
	expect(await devQuery(`SELECT 1 FROM clubfindr.users WHERE general_email = $1`, [email])).toEqual(
		[]
	);
	expect(await devQuery(`SELECT 1 FROM clubfindr.promoters WHERE email = $1`, [email])).toEqual([]);

	// Wait past the threshold first: expect.poll would call straight away, before anything had
	// been stranded long enough to count, and pass whatever the code did
	await page.waitForTimeout(2500);
	expect(await strandedTransactions()).toBe(0);
});

const FAIL_PREFIX = 'tx-promoter-fail-';
const TRIGGER = 'e2e_fail_venue_insert';

/**
 * A BEFORE INSERT trigger on clubfindr.bars that raises for e-mails starting with FAIL_PREFIX.
 * The test drops it as soon as its request is answered, and it is dropped first here too, so a
 * run that died half-way cannot leave a second copy (and a leftover only ever matches this
 * test's own e-mails). Not part of dev/schema.sql or any migration;
 * dev/check-migrations.sh does not look at triggers.
 */
async function installFailingVenueTrigger() {
	await removeFailingVenueTrigger();
	await devQuery(`CREATE FUNCTION clubfindr.${TRIGGER}() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'e2e: venue insert refused on purpose'; END $$`);
	await devQuery(`CREATE TRIGGER ${TRIGGER} BEFORE INSERT ON clubfindr.bars FOR EACH ROW
		WHEN (NEW.general_email LIKE '${FAIL_PREFIX}%') EXECUTE FUNCTION clubfindr.${TRIGGER}()`);
}

async function removeFailingVenueTrigger() {
	await devQuery(`DROP TRIGGER IF EXISTS ${TRIGGER} ON clubfindr.bars`);
	await devQuery(`DROP FUNCTION IF EXISTS clubfindr.${TRIGGER}()`);
}
