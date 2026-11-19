import type { APIRequestContext } from '@playwright/test';
import { test, expect, mobileApi, bearer, testPassword } from './fixtures';
import { devQuery } from './db';
import { waitForMail } from './mail';

// A personal-account password reset ends every session of that account, web and app, as a
// venue's has since 2026-11-16 (KNOWN_ISSUES 80): a reset is usually the answer to a password
// someone else knows, and their logins must stop working with it.

const PASSWORD = testPassword();
const NEW_PASSWORD = `${testPassword()}x9!`;
const unique = () => `test-reset-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;

async function signUp(api: APIRequestContext, email: string) {
	const response = await api.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			isMobileApp: true,
			email,
			password: PASSWORD,
			fullName: 'Reset Test'
		}
	});
	expect(response.status(), await response.text()).toBe(200);
}

test('resetting a personal password ends its session', async ({ page, playwright, baseURL }) => {
	const api = await mobileApi(playwright, baseURL);
	const email = unique();
	try {
		await signUp(api, email);
		// An account has one session at a time (user_sessions.unique_user_id: a login replaces
		// the previous one), so the live session here is the app's Bearer token; the web login
		// before it is what the owner's browser would hold until then
		const webLogin = await page.request.post('/login/users', {
			data: { provider: 'local', isNewUser: false, isMobileApp: false, email, password: PASSWORD }
		});
		expect(webLogin.status(), await webLogin.text()).toBe(200);
		const appLogin = await api.post('/api/mobile/login', { data: { email, password: PASSWORD } });
		expect(appLogin.status()).toBe(200);
		const token = (await appLogin.json()).token as string;
		expect((await api.get('/api/taste/artists', { headers: bearer(token) })).status()).toBe(200);

		const startedAt = Date.now();
		expect((await api.post('/api/request-password-reset', { data: { email } })).status()).toBe(200);
		const mail = await waitForMail(
			(m) => m.to === email && Date.parse(m.at) >= startedAt && /password-reset\//.test(m.text)
		);
		const resetToken = mail?.text.match(/\/password-reset\/([0-9a-f]{64})/)?.[1];
		expect(resetToken, 'a reset link for the account').toBeDefined();

		const reset = await api.post('/api/reset-password', {
			data: { token: resetToken, newPassword: NEW_PASSWORD }
		});
		expect(reset.status(), await reset.text()).toBe(200);
		expect((await reset.json()).account).toBe('user');

		// The session is gone, in the database and in the hooks cache
		expect((await api.get('/api/taste/artists', { headers: bearer(token) })).status()).toBe(401);
		expect((await page.request.get('/api/taste/artists')).status()).toBe(401);
		const left = await devQuery(
			`SELECT 1 FROM clubfindr.user_sessions s JOIN clubfindr.users u ON u.id = s.user_id
			  WHERE u.general_email = $1`,
			[email]
		);
		expect(left).toHaveLength(0);

		// The new password works, the old one does not, and the link was spent
		expect(
			(await api.post('/api/mobile/login', { data: { email, password: NEW_PASSWORD } })).status()
		).toBe(200);
		expect(
			(await api.post('/api/mobile/login', { data: { email, password: PASSWORD } })).status()
		).toBe(401);
		expect(
			(
				await api.post('/api/reset-password', {
					data: { token: resetToken, newPassword: NEW_PASSWORD }
				})
			).status()
		).toBe(400);
	} finally {
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});
