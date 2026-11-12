import { test, expect, testPassword } from './fixtures';
import { waitForMail } from './mail';
import { devQuery } from './db';

// Web venue registration end to end: /register, the e-mailed code, /register/confirm.
// The confirm step used to require the Spotify OAuth cookies the registration form's Spotify
// branch left behind, and answered 400 "Spotify authentication tokens are missing" without
// them, so with SPOTIFY_CONNECT_ENABLED=false (production since 2026-11-12) no venue registering
// on the web could confirm its account. Nothing tested the confirm POST until now.

const PASSWORD = testPassword();
const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test('a venue registered on the web confirms with its e-mailed code, no Spotify', async ({
	page
}) => {
	const verified = await page.request.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'mock-captcha-ok' }
	});
	expect(verified.status()).toBe(200);

	const email = `${unique('venue-confirm')}@clubfindr.test`;
	const startedAt = Date.now();
	const registered = await page.request.post('/register', {
		data: {
			businessName: unique('Confirm Test Bar'),
			contactPerson: 'Confirm Test',
			email,
			phone: '+49 30 1234567',
			address: 'Teststrasse 5',
			postcode: '10115',
			cityName: 'Berlin',
			website: '',
			password: PASSWORD,
			smokingAllowed: false,
			barTypes: ['club']
		}
	});
	expect(registered.status(), await registered.text()).toBe(200);

	const mail = await waitForMail((m) => m.to === email && Date.parse(m.at) >= startedAt);
	const code = mail?.text.match(/Your confirmation code is ([0-9A-F]{6})/)?.[1];
	expect(code, 'confirmation code in the owner mail').toBeDefined();

	const wrong = await page.request.post('/register/confirm', {
		data: { email, confirmationCode: code === '000000' ? '111111' : '000000' }
	});
	expect(wrong.status()).toBe(400);
	expect((await wrong.json()).error).toContain('Invalid confirmation code');

	const confirmed = await page.request.post('/register/confirm', {
		data: { email, confirmationCode: code }
	});
	expect(confirmed.status(), await confirmed.text()).toBe(200);
	expect(await confirmed.json()).toEqual({ success: true });

	const rows = await devQuery<{ confirmed: boolean }>(
		'SELECT confirmed FROM clubfindr.bars WHERE general_email = $1',
		[email]
	);
	expect(rows).toEqual([{ confirmed: true }]);
});

test('a fresh code is not expired, and a resend has to wait for it', async ({ page }) => {
	// bars.expires_at holds UTC wall-clock time; read back in a timezone east of UTC (production
	// is in Germany) a fresh code looked expired, and the resend throttle never applied
	// ($lib/server/barCodeExpiry)
	const verified = await page.request.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'mock-captcha-ok' }
	});
	expect(verified.status()).toBe(200);
	const email = `${unique('venue-resend')}@clubfindr.test`;
	const registered = await page.request.post('/register', {
		data: {
			businessName: unique('Resend Test Bar'),
			contactPerson: 'Resend Test',
			email,
			phone: '+49 30 1234567',
			address: 'Teststrasse 6',
			postcode: '10115',
			cityName: 'Berlin',
			website: '',
			password: PASSWORD
		}
	});
	expect(registered.status(), await registered.text()).toBe(200);

	const resend = await page.request.post('/register/confirm/resend-code', { data: { email } });
	expect(resend.status()).toBe(429);
	expect((await resend.json()).error).toMatch(/Please wait (9|10) minutes before requesting/);
});

test('a venue registered in the app confirms with its e-mailed code', async ({ page }) => {
	const email = `${unique('mobile-venue-confirm')}@clubfindr.test`;
	const startedAt = Date.now();
	const registered = await page.request.post('/api/mobile/bars/register', {
		data: {
			businessName: unique('Mobile Confirm Bar'),
			contactPerson: 'Mobile Confirm Test',
			email,
			phone: '+49 30 1234567',
			address: 'Teststrasse 7',
			postcode: '10115',
			cityName: 'Berlin',
			website: '',
			password: PASSWORD
		}
	});
	expect(registered.status(), await registered.text()).toBe(200);

	const mail = await waitForMail((m) => m.to === email && Date.parse(m.at) >= startedAt);
	const code = mail?.text.match(/Your confirmation code is: ([0-9A-F]{6})/)?.[1];
	expect(code, 'confirmation code in the owner mail').toBeDefined();

	const confirmed = await page.request.post('/api/mobile/bars/confirm', {
		data: { email, confirmationCode: code }
	});
	expect(confirmed.status(), await confirmed.text()).toBe(200);
	expect(
		await devQuery('SELECT confirmed FROM clubfindr.bars WHERE general_email = $1', [email])
	).toEqual([{ confirmed: true }]);
});
