import bcryptjs from 'bcryptjs';
import { test, expect, mobileApi, bearer, testPassword } from './fixtures';
import { registerVenue, removeVenue, type TestVenue } from './venue';
import { devQuery } from './db';
import { waitForMail } from './mail';

// One venue login for the web and the app ($lib/server/venueLogin, KNOWN_ISSUES 69) and a
// password reset that reaches a venue's own login (KNOWN_ISSUES 68), both 2026-11-16.
//
// Each test registers a venue of its own (tests/venue.ts, KNOWN_ISSUES 59). Registration makes
// a personal account under the venue's address too, linked by bars.user_id; moving that account
// to another address separates the two logins so each can be tried alone.

const NEW_PASSWORD = testPassword();

function uniqueEmail(label: string) {
	return `test-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;
}

/** Moves the venue's personal account to its own address and returns that address. */
async function separatePersonalAccount(venue: TestVenue): Promise<string> {
	const personal = uniqueEmail('person');
	await devQuery(
		`UPDATE clubfindr.users SET general_email = $1
		  WHERE id = (SELECT user_id FROM clubfindr.bars WHERE id = $2)`,
		[personal, venue.barId]
	);
	return personal;
}

test('a personal account opens the venue it registered, on the web and in the app', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const web = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	let personal: string | undefined;
	try {
		venue = await registerVenue(api, 'personal-login');
		personal = await separatePersonalAccount(venue);

		const app = await api.post('/api/mobile/bars/login', {
			data: { email: personal, password: venue.password }
		});
		expect(app.status(), await app.text()).toBe(200);
		expect((await app.json()).barData.id).toBe(venue.barId);

		const dashboard = await web.post('/login/bars', {
			data: { email: personal, password: venue.password }
		});
		expect(dashboard.status(), await dashboard.text()).toBe(200);
		expect((await dashboard.json()).redirectUrl).toBe('/bars');

		// The venue's own login still works next to it
		const own = await api.post('/api/mobile/bars/login', {
			data: { email: venue.email, password: venue.password }
		});
		expect(own.status()).toBe(200);
	} finally {
		if (personal)
			await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [personal]);
		await removeVenue(venue);
		await api.dispose();
		await web.dispose();
	}
});

test('an unconfirmed venue is refused on the web as in the app', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'unconfirmed');
		await devQuery('UPDATE clubfindr.bars SET confirmed = false WHERE id = $1', [venue.barId]);
		const credentials = { email: venue.email, password: venue.password };

		expect((await api.post('/api/mobile/bars/login', { data: credentials })).status()).toBe(403);
		const web = await api.post('/login/bars', { data: credentials });
		expect(web.status()).toBe(403);
		expect((await web.json()).message).toMatch(/confirm/i);

		// A wrong password says nothing about the venue's state
		const wrong = { email: venue.email, password: `${venue.password}x` };
		expect((await api.post('/api/mobile/bars/login', { data: wrong })).status()).toBe(401);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});

// KNOWN_ISSUES 62 on the app's path: /register/promoter writes a venue row with no password
// under the promoter's address, and the app's venue login compared against it and answered 500.
test('a promoter without a venue is refused by the app, not answered 500', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = uniqueEmail('promoter');
	const password = testPassword();
	try {
		await devQuery(
			`INSERT INTO clubfindr.users (general_email, password_hash, city, is_promoter)
			 VALUES ($1, $2, 'berlin', true)`,
			[email, bcryptjs.hashSync(password, 4)]
		);
		await devQuery(
			`INSERT INTO clubfindr.bars (name, contact_person, general_email, city, confirmed)
			 VALUES ('Promoter night', 'Promoter', $1, 'berlin', true)`,
			[email]
		);

		const app = await api.post('/api/mobile/bars/login', { data: { email, password } });
		expect(app.status(), await app.text()).toBe(403);
		expect((await app.json()).message).toMatch(/no venue/i);

		// The web still sends the promoter to their dashboard
		const web = await api.post('/login/bars', { data: { email, password } });
		expect(web.status()).toBe(200);
		expect((await web.json()).redirectUrl).toBe('/promoter-home');
	} finally {
		await devQuery('DELETE FROM clubfindr.bars WHERE general_email = $1', [email]);
		await devQuery(
			'DELETE FROM clubfindr.user_sessions WHERE user_id IN (SELECT id FROM clubfindr.users WHERE general_email = $1)',
			[email]
		);
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});

test('a venue resets its own password, and its old sessions end', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	let personal: string | undefined;
	try {
		venue = await registerVenue(api, 'reset');
		// Only the venue's own login is left under its address
		personal = await separatePersonalAccount(venue);
		const oldToken = venue.token;
		expect(
			(
				await api.get(`/api/mobile/bars/${venue.barId}/stats`, { headers: bearer(oldToken) })
			).status()
		).toBe(200);

		const startedAt = Date.now();
		const requested = await api.post('/api/request-password-reset', {
			data: { email: venue.email }
		});
		expect(requested.status()).toBe(200);
		const mail = await waitForMail(
			(m) =>
				m.to === venue!.email && Date.parse(m.at) >= startedAt && /password-reset\//.test(m.text)
		);
		const token = mail?.text.match(/\/password-reset\/([0-9a-f]{64})/)?.[1];
		expect(token, 'a reset link for the venue').toBeDefined();

		const reset = await api.post('/api/reset-password', {
			data: { token, newPassword: NEW_PASSWORD }
		});
		expect(reset.status(), await reset.text()).toBe(200);

		const fresh = await api.post('/api/mobile/bars/login', {
			data: { email: venue.email, password: NEW_PASSWORD }
		});
		expect(fresh.status()).toBe(200);
		expect(
			(
				await api.post('/api/mobile/bars/login', {
					data: { email: venue.email, password: venue.password }
				})
			).status()
		).toBe(401);
		expect(
			(
				await api.get(`/api/mobile/bars/${venue.barId}/stats`, { headers: bearer(oldToken) })
			).status()
		).toBe(403);

		// The link works once
		expect(
			(
				await api.post('/api/reset-password', { data: { token, newPassword: NEW_PASSWORD } })
			).status()
		).toBe(400);
	} finally {
		if (personal)
			await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [personal]);
		await removeVenue(venue);
		await api.dispose();
	}
});
