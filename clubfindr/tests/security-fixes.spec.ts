import {
	test,
	expect,
	acceptCookies,
	openBarDashboard,
	mobileApi,
	bearer,
	testPassword
} from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import { devQuery } from './db';

// The critical fixes of 2026-11-13 (KNOWN_ISSUES 52, 53, 57; docs/section4-inventory.md):
// - the venue write guards accepted a plain, forgeable `barId` cookie, and /api/bars/[barId]
//   had its check switched off altogether; the web dashboard now holds a real bar session in an
//   encrypted httpOnly cookie, like the app's Bearer token;
// - check-in and the cookie-consent endpoint took the user from the request body;
// - queries that named tables without the clubfindr schema could not run (the mobile QR code
//   routes, check-in, the promoter code resend) and /update-info wrote a non-existent column.
//
// Venue requests use cookie-less contexts (mobileApi), so only what a test sends can authorise
// them. Throwaway users and QR codes are created per test and removed afterwards.

const BAR_ID = '00000000-0000-4000-8000-0000000000b1';
const OTHER_BAR_ID = '00000000-0000-4000-8000-0000000000b2';
const PASSWORD = testPassword();
const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function barToken(api: APIRequestContext): Promise<string> {
	const loggedIn = await api.post('/api/mobile/bars/login', {
		data: { email: 'bar@clubfindr.test', password: 'BarManager#2026' }
	});
	expect(loggedIn.status()).toBe(200);
	return (await loggedIn.json()).token;
}

/** A new user, logged in through the app's endpoints: their id and session token. */
async function userSession(api: APIRequestContext) {
	const email = `${unique('security-user')}@clubfindr.test`;
	const signup = await api.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			isMobileApp: true,
			email,
			password: PASSWORD,
			fullName: 'Security Test'
		}
	});
	expect(signup.status(), await signup.text()).toBe(200);
	const login = await api.post('/api/mobile/login', { data: { email, password: PASSWORD } });
	expect(login.status(), await login.text()).toBe(200);
	const { user, token } = await login.json();
	return { userId: user.id as string, token: token as string, email };
}

test.describe('venue guards trust only a real session', () => {
	test('a forged barId cookie is refused everywhere a venue writes or reads its own data', async ({
		playwright,
		baseURL
	}) => {
		const forged = await mobileApi(playwright, baseURL);
		const cookie = { Cookie: `barId=${BAR_ID}` };
		const attempts = [
			() =>
				forged.post(`/api/mobile/bars/${BAR_ID}/events`, {
					data: { theme_name: 'forged', event_date: '2031-06-22' },
					headers: cookie
				}),
			() =>
				forged.put(`/api/venues/${BAR_ID}/taste/genres`, {
					data: { genres: ['techno'] },
					headers: cookie
				}),
			() => forged.get(`/api/bars/${BAR_ID}`, { headers: cookie }),
			() =>
				forged.patch(`/api/bars/${BAR_ID}`, {
					data: { general_email: 'attacker@example.com' },
					headers: cookie
				}),
			() =>
				forged.post(`/api/bars/${BAR_ID}/events`, {
					data: { theme_name: 'forged', event_date: '2031-06-22' },
					headers: cookie
				}),
			() => forged.get(`/api/bars/${BAR_ID}/events`, { headers: cookie })
		];
		for (const attempt of attempts) {
			const response = await attempt();
			expect(response.status(), `${response.url()} with a forged cookie`).toBe(403);
		}
		await forged.dispose();
		// And nothing was changed
		const [bar] = await devQuery<{ general_email: string }>(
			'SELECT general_email FROM clubfindr.bars WHERE id = $1',
			[BAR_ID]
		);
		expect(bar.general_email).toBe('bar@clubfindr.test');
	});

	test('the dashboard works on its session cookie, which is httpOnly and ends at logout', async ({
		page,
		context,
		playwright,
		baseURL
	}) => {
		await openBarDashboard(page);
		const session = (await context.cookies()).find((c) => c.name === 'barSession');
		expect(session, 'barSession cookie').toBeDefined();
		expect(session!.httpOnly).toBe(true);
		// The cookie holds an encrypted value, not the bare session id
		expect(session!.value).not.toMatch(/^[0-9a-f-]{36}$/);

		const details = await page.request.get(`/api/bars/${BAR_ID}`);
		expect(details.status()).toBe(200);
		expect((await details.json()).id).toBe(BAR_ID);
		// Another venue stays out of reach for this session
		expect((await page.request.get(`/api/bars/${OTHER_BAR_ID}`)).status()).toBe(403);

		// An app login by the same venue replaces the app's session only, not this one (it used
		// to delete every session of the venue)
		const app = await mobileApi(playwright, baseURL);
		await barToken(app);
		await app.dispose();
		expect((await page.request.get(`/api/bars/${BAR_ID}`)).status()).toBe(200);

		expect((await page.request.post('/api/logout')).status()).toBe(200);
		expect((await page.request.get(`/api/bars/${BAR_ID}`)).status()).toBe(403);
	});
});

test.describe('QR codes and check-in', () => {
	test('a venue creates, lists, promotes and deletes a QR code with its token', async ({
		playwright,
		baseURL
	}) => {
		const api = await mobileApi(playwright, baseURL);
		const token = await barToken(api);
		const title = unique('QR');

		const created = await api.post(`/api/mobile/bars/${BAR_ID}/qrcodes`, {
			data: { title, type: 'table' },
			headers: bearer(token)
		});
		expect(created.status(), await created.text()).toBe(200);
		const listed = await (await api.get(`/api/mobile/bars/${BAR_ID}/qrcodes`)).json();
		const qr = listed.qrCodes.find((q: { title: string }) => q.title === title);
		expect(qr, 'the new QR code is listed').toBeDefined();

		const promoted = await api.post(`/api/mobile/bars/${BAR_ID}/qrcodes/${qr.id}/promotion`, {
			data: { requestType: 'printed_materials' },
			headers: bearer(token)
		});
		expect(promoted.status(), await promoted.text()).toBe(200);
		expect(
			await devQuery('SELECT 1 FROM clubfindr.promotion_requests WHERE qr_id = $1', [qr.id])
		).toHaveLength(1);

		expect(
			(
				await api.delete(`/api/mobile/bars/${BAR_ID}/qrcodes/not-a-number`, {
					headers: bearer(token)
				})
			).status()
		).toBe(400);
		const deleted = await api.delete(`/api/mobile/bars/${BAR_ID}/qrcodes/${qr.id}`, {
			headers: bearer(token)
		});
		expect(deleted.status()).toBe(200);
		const after = await (await api.get(`/api/mobile/bars/${BAR_ID}/qrcodes`)).json();
		expect(after.qrCodes.map((q: { id: number }) => q.id)).not.toContain(qr.id);

		await devQuery('DELETE FROM clubfindr.promotion_requests WHERE qr_id = $1', [qr.id]);
		await api.dispose();
	});

	test('check-in records the session user only, for a QR code of that venue', async ({
		playwright,
		baseURL
	}) => {
		const api = await mobileApi(playwright, baseURL);
		const [qr] = await devQuery<{ id: number }>(
			'SELECT id FROM clubfindr.bar_qr_codes WHERE bar_id = $1 ORDER BY id LIMIT 1',
			[BAR_ID]
		);
		const { userId, token } = await userSession(api);
		const body = { barId: BAR_ID, qrId: String(qr.id) };

		expect((await api.post('/api/mobile/checkin', { data: body })).status()).toBe(401);
		const someoneElse = await api.post('/api/mobile/checkin', {
			data: { ...body, userId: '00000000-0000-4000-8000-000000000004' },
			headers: bearer(token)
		});
		expect(someoneElse.status()).toBe(403);
		const wrongVenue = await api.post('/api/mobile/checkin', {
			data: { ...body, barId: OTHER_BAR_ID },
			headers: bearer(token)
		});
		expect(wrongVenue.status()).toBe(404);
		const malformed = await api.post('/api/mobile/checkin', {
			data: { barId: 'x', qrId: 'y' },
			headers: bearer(token)
		});
		expect(malformed.status()).toBe(400);

		// An older app still sends its own userId; that is fine
		const ok = await api.post('/api/mobile/checkin', {
			data: { ...body, userId },
			headers: bearer(token)
		});
		expect(ok.status(), await ok.text()).toBe(200);
		expect(await ok.json()).toMatchObject({ success: true, venueName: 'The Copper Lantern' });
		expect(
			await devQuery('SELECT bar_id FROM clubfindr.user_checkins WHERE user_id = $1', [userId])
		).toEqual([{ bar_id: BAR_ID }]);

		await devQuery('DELETE FROM clubfindr.user_checkins WHERE user_id = $1', [userId]);
		await api.dispose();
	});
});

test('cookie consent is stored for the session user, never the one in the body', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const { userId, token } = await userSession(api);
	const victim = '00000000-0000-4000-8000-000000000004';
	const [before] = await devQuery<{ cookie_preferences: unknown }>(
		'SELECT cookie_preferences FROM clubfindr.users WHERE id = $1',
		[victim]
	);
	const prefs = { necessary: true, analytics: true, marketing: false, performance: false };

	expect(
		(
			await api.post('/api/save-cookie-consent', {
				data: { userId: victim, cookiePreferences: prefs }
			})
		).status()
	).toBe(401);
	const saved = await api.post('/api/save-cookie-consent', {
		data: { userId: victim, cookiePreferences: prefs },
		headers: bearer(token)
	});
	expect(saved.status(), await saved.text()).toBe(200);
	expect(
		await (await api.get('/api/save-cookie-consent', { headers: bearer(token) })).json()
	).toEqual(prefs);
	expect(
		(
			await api.post('/api/save-cookie-consent', {
				data: { cookiePreferences: { analytics: 'yes' } },
				headers: bearer(token)
			})
		).status()
	).toBe(400);

	const [mine] = await devQuery('SELECT cookie_preferences FROM clubfindr.users WHERE id = $1', [
		userId
	]);
	expect(mine).toEqual({ cookie_preferences: prefs });
	const [after] = await devQuery<{ cookie_preferences: unknown }>(
		'SELECT cookie_preferences FROM clubfindr.users WHERE id = $1',
		[victim]
	);
	expect(after).toEqual(before);
	await api.dispose();
});

test('changing the e-mail on /update-info works, and a taken address is refused', async ({
	page
}) => {
	const email = `${unique('update-info')}@clubfindr.test`;
	const signup = await page.request.post('/login/users', {
		data: { provider: 'local', isNewUser: true, email, password: PASSWORD, fullName: 'Update Info' }
	});
	expect(signup.status(), await signup.text()).toBe(200);

	// The action wrote a column that does not exist (`email`), so this answered 500
	await page.goto('/update-info');
	await acceptCookies(page);
	await expect(page.locator('#email')).toBeVisible();

	await page.locator('#email').fill('fan@clubfindr.test');
	await page.locator('#current-password').fill(PASSWORD);
	await page.locator('button[type="submit"]').click();
	await expect(page.locator('body')).toContainText('already used by another account');

	const newEmail = `${unique('update-info-new')}@clubfindr.test`;
	await page.locator('#email').fill(newEmail);
	await page.locator('#current-password').fill(PASSWORD);
	await page.locator('button[type="submit"]').click();
	await expect(page.locator('body')).toContainText('Profile updated successfully');
	expect(
		await devQuery('SELECT 1 FROM clubfindr.users WHERE general_email = $1', [newEmail])
	).toHaveLength(1);
});

test('the promoter code resend runs (and makes a fresh code wait)', async ({ page }) => {
	const verified = await page.request.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'mock-captcha-ok' }
	});
	expect(verified.status()).toBe(200);
	const email = `${unique('promoter-resend')}@clubfindr.test`;
	const registered = await page.request.post('/register/promoter', {
		data: {
			businessName: unique('Resend Promoter'),
			contactPerson: 'Resend Test',
			email,
			phone: '+49 30 1234567',
			address: 'Teststrasse 8',
			postcode: '10115',
			cityName: 'Berlin',
			website: '',
			password: PASSWORD
		}
	});
	expect(registered.status(), await registered.text()).toBe(200);

	const resend = await page.request.post('/register/promoter/confirm/resend-code', {
		data: { email }
	});
	expect(resend.status(), await resend.text()).toBe(429);
	expect((await resend.json()).error).toMatch(/Please wait (9|10) minutes before resending/);
});

test('the dead and debug routes are gone', async ({ playwright, baseURL }) => {
	const api = await mobileApi(playwright, baseURL);
	expect((await api.post('/api/update-user', { data: {} })).status()).toBe(404);
	expect((await api.post('/api/mobile/signup/complete', { data: {} })).status()).toBe(404);
	for (const path of ['/api/soundcloud/debug-token?token=x', '/api/tidal/debug-token?token=x']) {
		expect((await api.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
	}
	await api.dispose();
});
