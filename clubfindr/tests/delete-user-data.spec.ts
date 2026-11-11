import { test, expect, type Page, testPassword } from './fixtures';
import { waitForMail } from './mail';
import { devQuery } from './db';

// "Delete my data" (/delete-confirmation -> POST /api/delete-user-data; KNOWN_ISSUES 24).
//
// The account is anonymised, not removed: the users row stays so nothing pointing at it breaks.
// What has to go is everything that identifies or describes the person. Most of it has no HTTP
// read path once the account is gone — that is the point — so the outcome is checked in the
// database (tests/db.ts, dev database only).
//
// Each test signs up its own throwaway account, so deleting it touches no seeded user.

const PASSWORD = testPassword();
const FAVOURITE = 'devGlassAnvil000000001';

function uniqueEmail(testName: string) {
	const slug = testName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 30);
	return `delete-${slug}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;
}

async function signUp(page: Page, email: string): Promise<string> {
	const response = await page.request.post('/login/users', {
		data: { provider: 'local', isNewUser: true, email, password: PASSWORD, fullName: 'Delete Me' }
	});
	expect(response.status()).toBe(200);
	const [user] = await devQuery<{ id: string }>(
		'SELECT id FROM clubfindr.users WHERE general_email = $1',
		[email]
	);
	return user.id;
}

/** Requests a deletion code by e-mail and reads it back from the captured mail. */
async function deletionCode(page: Page, email: string): Promise<string> {
	const response = await page.request.post('/api/send-delete-confirmation-code', {
		data: { email }
	});
	expect(response.status()).toBe(200);
	const mail = await waitForMail((m) => m.to === email && /Data Deletion/.test(m.subject));
	const code = mail?.text.match(/code is ([0-9A-F]{6})/)?.[1];
	expect(code, 'a deletion code in the captured mail').toBeTruthy();
	return code!;
}

async function sessionIdOf(page: Page): Promise<string> {
	const cookie = (await page.context().cookies()).find((c) => c.name === 'sessionId');
	expect(cookie, 'a session cookie after signing up').toBeTruthy();
	return cookie!.value;
}

test('deleting your data clears the profile, the taste and every session', async ({
	page
}, testInfo) => {
	const email = uniqueEmail(testInfo.title);
	const userId = await signUp(page, email);

	// What a real account accumulates. The favourite goes through the app; the rest has no form
	// the suite can drive offline (social login, the onboarding preferences), so it is set here.
	expect(
		(await page.request.post('/api/taste/artists', { data: { sourceId: FAVOURITE } })).status()
	).toBe(201);
	await devQuery(
		`UPDATE clubfindr.users
		    SET preferences = '{"vibe": "dark"}', interested_events = ARRAY['evt-1', 'evt-2'],
		        city = 'Berlin', google_id = 'google-' || $1, facebook_id = 'facebook-' || $1
		  WHERE id = $1`,
		[userId]
	);
	// Visit a page that reads the session through hooks.server.ts, which caches it in memory
	await page.goto('/update-info');
	await expect(page.locator('body')).toContainText('Update Profile');
	const sessionId = await sessionIdOf(page);

	const code = await deletionCode(page, email);
	const response = await page.request.post('/api/delete-user-data', {
		data: { email, confirmationCode: code }
	});
	expect(response.status()).toBe(200);

	const [user] = await devQuery(
		`SELECT name, general_email, preferences, interested_events, city, google_id, facebook_id,
		        confirmation_code, expires_at
		   FROM clubfindr.users WHERE id = $1`,
		[userId]
	);
	expect(user.general_email).not.toBe(email);
	expect(user).toMatchObject({
		name: null,
		preferences: null,
		interested_events: null,
		city: '', // NOT NULL in the schema, so emptied
		// Google and Facebook sign-in look the account up by these, so leaving them would let the
		// next "Continue with Google" walk straight back into the deleted account
		google_id: null,
		facebook_id: null,
		// Spent, so the code cannot be replayed
		confirmation_code: null,
		expires_at: null
	});
	expect(
		await devQuery('SELECT 1 FROM clubfindr.user_favourite_artists WHERE user_id = $1', [userId])
	).toEqual([]);
	expect(
		await devQuery('SELECT 1 FROM clubfindr.user_sessions WHERE user_id = $1', [userId])
	).toEqual([]);

	// The old session is dead on the server, not just forgotten by this browser: replaying its id
	// must not reach the profile, even through the session cache in hooks.server.ts.
	const replay = await page.request.get('/update-info', {
		headers: { cookie: `sessionId=${sessionId}` }
	});
	expect(await replay.text()).not.toContain('Update Profile');
	expect(
		(
			await page.request.get('/api/taste/artists', {
				headers: { cookie: `sessionId=${sessionId}` }
			})
		).status()
	).toBe(401);
});

test('a wrong code deletes nothing', async ({ page }, testInfo) => {
	const email = uniqueEmail(testInfo.title);
	const userId = await signUp(page, email);
	await deletionCode(page, email);

	const response = await page.request.post('/api/delete-user-data', {
		data: { email, confirmationCode: 'NOPE00' }
	});
	expect(response.status()).toBe(400);
	const [user] = await devQuery<{ general_email: string; name: string | null }>(
		'SELECT general_email, name FROM clubfindr.users WHERE id = $1',
		[userId]
	);
	expect(user).toEqual({ general_email: email, name: 'Delete Me' });
	expect(
		await devQuery('SELECT 1 FROM clubfindr.user_sessions WHERE user_id = $1', [userId])
	).toHaveLength(1);
});
