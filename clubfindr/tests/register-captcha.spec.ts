import { test, expect, testPassword } from './fixtures';

// KNOWN_ISSUES 28: the registration pages checked the reCAPTCHA in the browser only —
// /api/verify-captcha unlocked the form, but POST /register and POST /register/promoter
// trusted whatever arrived, so a script could register venues by posting directly.
//
// Now /api/verify-captcha marks the visitor with an encrypted cookie when the token is good
// ($lib/server/captcha), both registration endpoints require it, and a successful registration
// spends it. The token is judged by tests/mock-recaptcha.ts, standing in for Google:
// 'mock-captcha-ok' is good, everything else is not.

const PASSWORD = testPassword();
const unique = (base: string) => `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function venue(name: string, email: string) {
	return {
		businessName: name,
		contactPerson: 'Captcha Test',
		email,
		phone: '+49 30 1234567',
		address: 'Teststrasse 2',
		postcode: '10115',
		cityName: 'Berlin',
		website: '',
		password: PASSWORD,
		smokingAllowed: false,
		barTypes: ['club']
	};
}

test('posting /register without passing the captcha is refused', async ({ page }) => {
	const response = await page.request.post('/register', {
		data: venue(unique('No Captcha Bar'), `${unique('no-captcha')}@clubfindr.test`)
	});
	expect(response.status()).toBe(403);
	expect(await response.json()).toMatchObject({ success: false });
});

test('posting /register/promoter without passing the captcha is refused', async ({ page }) => {
	const response = await page.request.post('/register/promoter', {
		data: {
			businessName: unique('No Captcha Promoter'),
			contactPerson: 'Captcha Test',
			email: `${unique('no-captcha-promoter')}@clubfindr.test`,
			phone: '+49 30 1234567',
			address: 'Teststrasse 2',
			postcode: '10115',
			cityName: 'Berlin',
			website: '',
			password: PASSWORD
		}
	});
	expect(response.status()).toBe(403);
});

test('a bad token does not unlock registration', async ({ page }) => {
	const refused = await page.request.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'not-a-real-token' }
	});
	expect(refused.status()).toBe(400);

	const response = await page.request.post('/register', {
		data: venue(unique('Bad Token Bar'), `${unique('bad-token')}@clubfindr.test`)
	});
	expect(response.status(), 'still refused after a failed verification').toBe(403);
});

test('a good token admits exactly one registration', async ({ page }) => {
	const verified = await page.request.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'mock-captcha-ok' }
	});
	expect(verified.status()).toBe(200);
	expect(await verified.json()).toEqual({ success: true });

	const first = await page.request.post('/register', {
		data: venue(unique('Captcha Bar'), `${unique('captcha-ok')}@clubfindr.test`)
	});
	expect(first.status(), await first.text()).toBe(200);
	expect(await first.json()).toEqual({ success: true });

	// The pass was spent on the registration above
	const second = await page.request.post('/register', {
		data: venue(unique('Captcha Bar Again'), `${unique('captcha-again')}@clubfindr.test`)
	});
	expect(second.status(), 'a second registration needs a new captcha').toBe(403);
});
