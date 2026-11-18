import { test, expect, mobileApi, bearer, testPassword } from './fixtures';
import { devQuery } from './db';
import { waitForMail } from './mail';

// Straight in after verifying (owner's request, 2026-11-18): /api/verify-email-code answers a
// successful verification with a session (token + user, the same shape as /api/mobile/login),
// so the app lands in the artist picker without a second login. A failed guess gets none.

const PASSWORD = testPassword();
const unique = () => `test-verify-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;

test('a verified sign-up is signed in at once, with a working session', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = unique();
	try {
		const startedAt = Date.now();
		const signedUp = await api.post('/api/mobile/signup', {
			data: { email, password: PASSWORD, name: 'Verify Test' }
		});
		expect(signedUp.status(), await signedUp.text()).toBe(201);

		const mail = await waitForMail(
			(m) => m.to === email && Date.parse(m.at) >= startedAt && /verification code is:/.test(m.text)
		);
		const code = mail?.text.match(/Your verification code is: ([0-9A-F]{6})/)?.[1];
		expect(code, `a verification code for the new account`).toBeDefined();

		// A wrong guess verifies nothing and carries no session
		const wrong = await api.post('/api/verify-email-code', {
			data: { email, confirmationCode: code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA' }
		});
		expect(wrong.status()).toBe(400);
		expect(await wrong.json()).not.toHaveProperty('token');

		const verified = await api.post('/api/verify-email-code', {
			data: { email, confirmationCode: code }
		});
		expect(verified.status(), await verified.text()).toBe(200);
		const body = await verified.json();
		expect(body.success).toBe(true);
		expect(body.token).toBeTruthy();
		expect(body.user.email).toBe(email);
		expect(body.user.name).toBe('Verify Test');
		// A new account starts without a city (owner's decision 2026-11-18)
		expect(body.user.city).toBe('');
		expect(body.user.artistOnboarding.required).toBe(true);

		// The token works like a login's: the account's own endpoints answer
		const city = await api.get('/api/account/city', { headers: bearer(body.token) });
		expect(city.status(), await city.text()).toBe(200);

		// Verifying again with the spent code gives no second session
		const replay = await api.post('/api/verify-email-code', {
			data: { email, confirmationCode: code }
		});
		expect(replay.status()).toBe(400);
	} finally {
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});
