import { test, expect, mobileApi, bearer, testPassword } from './fixtures';
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

test('a Spotify registration leaves no transaction open', async ({ page, playwright, baseURL }) => {
	// The unknown-user path used to return 404 between BEGIN and COMMIT, so it never committed
	// or rolled back. The endpoint requires the caller's own session now (KNOWN_ISSUES 42), so
	// the test registers as a real user: the two UPDATEs still run in one transaction, and the
	// refused unauthenticated call must not open one either.
	const anonymous = await page.request.post('/api/mobile/spotify/register', {
		data: {
			accessToken: 'mock-user-token-ok',
			userId: '00000000-0000-4000-8000-00000000dead',
			spotifyProfile: { id: 'nobody', email: null }
		}
	});
	expect(anonymous.status()).toBe(401);

	const api = await mobileApi(playwright, baseURL);
	const email = `${unique('tx-spotify')}@clubfindr.test`;
	const signup = await api.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			isMobileApp: true,
			email,
			password: PASSWORD,
			fullName: 'Transaction Spotify Test'
		}
	});
	expect(signup.status(), await signup.text()).toBe(200);
	const login = await api.post('/api/mobile/login', { data: { email, password: PASSWORD } });
	expect(login.status(), await login.text()).toBe(200);
	const { user, token } = await login.json();

	const response = await api.post('/api/mobile/spotify/register', {
		data: {
			accessToken: 'mock-user-token-ok',
			userId: user.id,
			// spotify_user_id is unique and the dev database lives across runs
			spotifyProfile: { id: unique('tx-spotify'), email: null }
		},
		headers: bearer(token)
	});
	expect(response.status(), await response.text()).toBe(200);

	// Wait past the threshold first: expect.poll would call straight away, before anything had
	// been stranded long enough to count, and pass whatever the code did
	await page.waitForTimeout(2500);
	expect(await strandedTransactions()).toBe(0);
});

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
