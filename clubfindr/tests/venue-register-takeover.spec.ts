import type { APIRequestContext } from '@playwright/test';
import { test, expect, mobileApi, testPassword } from './fixtures';
import { registerVenue, removeVenue, type TestVenue } from './venue';
import { devQuery } from './db';

// Registering a venue under someone else's address took over their account (2026-11-16): both
// /register and /api/mobile/bars/register set the existing personal account's password to the
// one typed, and overwrote an existing venue's password while keeping it confirmed, all before
// any confirmation code was entered ($lib/server/venueRegistration).

const OWNER_PASSWORD = testPassword();
const ATTACKER_PASSWORD = testPassword();

const unique = (label: string) =>
	`test-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;

function registration(email: string, password = ATTACKER_PASSWORD) {
	return {
		businessName: `Takeover ${Date.now()}`,
		contactPerson: 'Not The Owner',
		email,
		phone: '+49 30 1234567',
		address: 'Teststrasse 9',
		postcode: '10115',
		cityName: 'Berlin',
		website: '',
		password
	};
}

async function status(api: APIRequestContext, path: string, data: object) {
	return (await api.post(path, { data })).status();
}

test("registering a venue under a person's address leaves their password alone", async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = unique('person-takeover');
	let barId: string | undefined;
	try {
		const signup = await api.post('/login/users', {
			data: {
				provider: 'local',
				isNewUser: true,
				isMobileApp: true,
				email,
				password: OWNER_PASSWORD,
				fullName: 'Account Owner'
			}
		});
		expect(signup.status(), await signup.text()).toBe(200);

		const registered = await api.post('/api/mobile/bars/register', { data: registration(email) });
		expect(registered.status(), await registered.text()).toBe(200);
		barId = (await registered.json()).barId;

		// The owner's password still works and the attacker's does not
		expect(await status(api, '/api/mobile/login', { email, password: OWNER_PASSWORD })).toBe(200);
		expect(await status(api, '/api/mobile/login', { email, password: ATTACKER_PASSWORD })).toBe(
			401
		);
		// and the unconfirmed venue opens for nobody
		expect(
			await status(api, '/api/mobile/bars/login', { email, password: ATTACKER_PASSWORD })
		).toBe(403);
	} finally {
		if (barId) await devQuery('DELETE FROM clubfindr.bars WHERE id = $1', [barId]);
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});

test('a confirmed venue cannot be registered again, so its password stays', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'venue-takeover');
		const again = await api.post('/api/mobile/bars/register', {
			data: registration(venue.email)
		});
		expect(again.status()).toBe(409);
		expect((await again.json()).message).toMatch(/already registered/);

		const own = { email: venue.email, password: venue.password };
		expect(await status(api, '/api/mobile/bars/login', own)).toBe(200);
		expect(
			await status(api, '/api/mobile/bars/login', { ...own, password: ATTACKER_PASSWORD })
		).toBe(401);
		const row = await devQuery('SELECT name FROM clubfindr.bars WHERE id = $1', [venue.barId]);
		expect(row[0].name).not.toMatch(/^Takeover/);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});

test('the web registration refuses a confirmed venue the same way', async ({
	page,
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'web-takeover');
		const verified = await page.request.post('/api/verify-captcha', {
			data: { recaptchaResponse: 'mock-captcha-ok' }
		});
		expect(verified.status()).toBe(200);
		const again = await page.request.post('/register', {
			data: { ...registration(venue.email), smokingAllowed: false, barTypes: ['club'] }
		});
		expect(again.status()).toBe(409);
		expect(
			await status(api, '/api/mobile/bars/login', { email: venue.email, password: venue.password })
		).toBe(200);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});

test('an unconfirmed registration can be tried again', async ({ playwright, baseURL }) => {
	const api = await mobileApi(playwright, baseURL);
	const email = unique('retry');
	try {
		const first = await api.post('/api/mobile/bars/register', { data: registration(email) });
		expect(first.status()).toBe(200);
		const second = await api.post('/api/mobile/bars/register', {
			data: registration(email, OWNER_PASSWORD)
		});
		expect(second.status(), await second.text()).toBe(200);
		expect((await second.json()).barId).toBe((await first.json()).barId);
	} finally {
		await devQuery('DELETE FROM clubfindr.bars WHERE general_email = $1', [email]);
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});
