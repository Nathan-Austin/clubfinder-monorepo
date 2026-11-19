import { test, expect, mobileApi, bearer, testPassword } from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import { devQuery } from './db';

// Promoter auth is a real session (KNOWN_ISSUES 51, fixed 2026-11-14). /login/bars used to set
// a plain `promoterId=<users.id>` cookie, neither httpOnly nor signed, and /promoter-home and its
// event endpoints trusted it as it was, so anyone who knew a promoter's user id could act as
// them. A promoter now gets a user_sessions row in the encrypted httpOnly `sessionId` cookie,
// and every promoter route resolves that ($lib/server/promoterAuth).
//
// Each test registers its own promoter, so none of this touches the seeded promoter other
// specs log in as (one session per user; KNOWN_ISSUES 59). Requests use cookie-less contexts
// (mobileApi), each with its own cookie jar, so only what a test sends or was given can
// authorise them.

const SEEDED_PROMOTER_ID = '00000000-0000-4000-8000-000000000002';
const PASSWORD = testPassword();
const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const EVENT = {
	event_name: 'Promoter Auth Night',
	club_name: 'Parallax Cellar',
	club_address: 'Teststrasse 1',
	event_date: '2031-06-23',
	start_time: '23:00',
	end_time: '05:00',
	event_genres: ['techno'],
	price: '12',
	event_image: '',
	city: 'berlin',
	track_ids: []
};

/** A fresh promoter, registered through the real endpoints; returns the account's details. */
async function registerPromoter(api: APIRequestContext) {
	const verified = await api.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'mock-captcha-ok' }
	});
	expect(verified.status()).toBe(200);
	const email = `${unique('promoter-auth')}@clubfindr.test`;
	const registered = await api.post('/register/promoter', {
		data: {
			businessName: unique('Promoter Auth Venue'),
			contactPerson: 'Promoter Auth',
			email,
			phone: '+49 30 1234567',
			address: 'Teststrasse 1',
			postcode: '10115',
			cityName: 'Berlin',
			website: '',
			password: PASSWORD
		}
	});
	expect(registered.status(), await registered.text()).toBe(200);
	const [user] = await devQuery<{ id: string }>(
		'SELECT id FROM clubfindr.users WHERE general_email = $1',
		[email]
	);
	return { email, userId: user.id };
}

async function removePromoter({ email, userId }: { email: string; userId: string }) {
	await devQuery('DELETE FROM clubfindr.events WHERE promoter_id = $1', [userId]);
	await devQuery('DELETE FROM clubfindr.user_sessions WHERE user_id = $1', [userId]);
	await devQuery('DELETE FROM clubfindr.bars WHERE general_email = $1', [email]);
	await devQuery('DELETE FROM clubfindr.promoters WHERE id = $1', [userId]);
	await devQuery('DELETE FROM clubfindr.users WHERE id = $1', [userId]);
}

/** Logs the promoter in on the dashboard; the context keeps the cookies the response sets. */
async function loginPromoter(api: APIRequestContext, email: string) {
	const response = await api.post('/login/bars', { data: { email, password: PASSWORD } });
	expect(response.status(), await response.text()).toBe(200);
	expect(await response.json()).toEqual({ success: true, redirectUrl: '/promoter-home' });
}

async function cookieHeader(api: APIRequestContext): Promise<string> {
	const { cookies } = await api.storageState();
	return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

test('a forged promoterId cookie no longer opens any promoter route', async ({
	playwright,
	baseURL
}) => {
	const forged = await mobileApi(playwright, baseURL);
	const headers = { Cookie: `promoterId=${SEEDED_PROMOTER_ID}` };
	const eventPath = `/promoter-home/events/${crypto.randomUUID()}`;
	const attempts = [
		() => forged.get('/promoter-home/events', { headers }),
		() => forged.post('/promoter-home/events', { data: EVENT, headers }),
		() => forged.patch(eventPath, { data: { event_name: 'forged' }, headers }),
		() => forged.delete(eventPath, { headers }),
		() => forged.get('/api/spotify/search?q=anything', { headers })
	];
	for (const attempt of attempts) {
		const response = await attempt();
		expect(response.status(), `${response.url()} with a forged cookie`).toBe(401);
	}

	// The dashboard itself sends the visitor to the partner login
	const page = await forged.get('/promoter-home', { headers, maxRedirects: 0 });
	expect(page.status()).toBe(302);
	expect(page.headers()['location']).toBe('/login/bars');
	await forged.dispose();
});

test('a promoter manages its own events through its session, until it logs out', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const account = await registerPromoter(api);
	try {
		await loginPromoter(api, account.email);
		const { cookies } = await api.storageState();
		const session = cookies.find((c) => c.name === 'sessionId');
		expect(session, 'an encrypted session cookie').toBeDefined();
		expect(session!.httpOnly).toBe(true);
		expect(session!.value).not.toContain(account.userId);
		expect(cookies.find((c) => c.name === 'promoterId')?.httpOnly).toBe(true);

		const dashboard = await api.get('/promoter-home');
		expect(dashboard.status()).toBe(200);
		expect(await dashboard.text()).toContain('Promoter Dashboard');

		const listed = await api.get('/promoter-home/events');
		expect(listed.status()).toBe(200);
		expect(await listed.json()).toEqual([]);

		const created = await api.post('/promoter-home/events', { data: EVENT });
		expect(created.status(), await created.text()).toBe(200);
		const { event_id: eventId } = await created.json();
		expect(eventId).toBeTruthy();

		const renamed = await api.patch(`/promoter-home/events/${eventId}`, {
			data: { event_name: 'Promoter Auth Night, renamed' }
		});
		expect(renamed.status(), await renamed.text()).toBe(200);
		expect((await renamed.json()).event_name).toBe('Promoter Auth Night, renamed');

		const deleted = await api.delete(`/promoter-home/events/${eventId}`);
		expect(deleted.status(), await deleted.text()).toBe(200);
		expect(await api.get('/promoter-home/events').then((r) => r.json())).toEqual([]);

		// Logging out ends the session on the server, not just in this cookie jar: a copy of the
		// cookie taken before is worthless afterwards
		const copied = await cookieHeader(api);
		const loggedOut = await api.post('/api/logout');
		expect(loggedOut.status()).toBe(200);
		const replay = await api.get('/promoter-home/events', { headers: { Cookie: copied } });
		expect(replay.status()).toBe(401);
	} finally {
		await removePromoter(account);
		await api.dispose();
	}
});

test("a regular user's session does not pass the promoter guard", async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = `${unique('not-a-promoter')}@clubfindr.test`;
	try {
		const signup = await api.post('/login/users', {
			data: {
				provider: 'local',
				isNewUser: true,
				email,
				password: PASSWORD,
				fullName: 'Not A Promoter'
			}
		});
		expect(signup.status(), await signup.text()).toBe(200);
		const { cookies } = await api.storageState();
		expect(
			cookies.find((c) => c.name === 'sessionId'),
			'a live user session'
		).toBeDefined();

		expect((await api.get('/promoter-home/events')).status()).toBe(401);
		expect((await api.post('/promoter-home/events', { data: EVENT })).status()).toBe(401);
		const page = await api.get('/promoter-home', { maxRedirects: 0 });
		expect(page.status()).toBe(302);
		expect(page.headers()['location']).toBe('/login/bars');
	} finally {
		await devQuery(
			'DELETE FROM clubfindr.user_sessions WHERE user_id IN (SELECT id FROM clubfindr.users WHERE general_email = $1)',
			[email]
		);
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});

// A dashboard login opens a session of its own beside the app's (KNOWN_ISSUES 95; until
// 2026-11-19 user_sessions held one row per user and the dashboard reused the app's session)
test("logging in to the dashboard keeps the promoter's app session alive", async ({
	playwright,
	baseURL
}) => {
	const app = await mobileApi(playwright, baseURL);
	const web = await mobileApi(playwright, baseURL);
	const account = await registerPromoter(app);
	try {
		const appLogin = await app.post('/api/mobile/login', {
			data: { email: account.email, password: PASSWORD }
		});
		expect(appLogin.status(), await appLogin.text()).toBe(200);
		const { token } = await appLogin.json();
		expect((await app.get('/api/taste/artists', { headers: bearer(token) })).status()).toBe(200);

		await loginPromoter(web, account.email);
		expect((await web.get('/promoter-home/events')).status()).toBe(200);

		// The app's token is still a session of the promoter's, beside the dashboard's
		expect((await app.get('/api/taste/artists', { headers: bearer(token) })).status()).toBe(200);
		const rows = await devQuery<{ n: string }>(
			'SELECT count(*) AS n FROM clubfindr.user_sessions WHERE user_id = $1',
			[account.userId]
		);
		expect(rows).toEqual([{ n: '2' }]);
	} finally {
		await removePromoter(account);
		await app.dispose();
		await web.dispose();
	}
});
