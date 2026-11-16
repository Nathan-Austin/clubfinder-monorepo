import type { APIRequestContext } from '@playwright/test';
import { test, expect, mobileApi, bearer, testPassword, acceptCookies } from './fixtures';
import { devQuery } from './db';

// The account's city can be changed (KNOWN_ISSUES 67): GET/PUT /api/account/city, for the app
// (Bearer) and the web (/update-info). Each test signs up an account of its own, so the seeded
// users keep their cities.

const PASSWORD = testPassword();
const unique = () => `test-city-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;

async function signUp(api: APIRequestContext, email: string, isMobileApp: boolean) {
	const response = await api.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			isMobileApp,
			email,
			password: PASSWORD,
			fullName: 'City Test'
		}
	});
	expect(response.status(), await response.text()).toBe(200);
	return response.json();
}

async function removeUser(email: string) {
	await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
}

test('the app reads and changes the account city with its token', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = unique();
	try {
		const { token } = await signUp(api, email, true);
		expect(token).toBeTruthy();
		const auth = { headers: bearer(token) };

		const before = await api.get('/api/account/city', auth);
		expect(before.status()).toBe(200);
		const listed = await before.json();
		expect(listed.city).toBe('berlin');
		expect(listed.cities.map((c: { slug: string }) => c.slug)).toContain('stockholm');

		const changed = await api.put('/api/account/city', { ...auth, data: { city: 'London' } });
		expect(changed.status(), await changed.text()).toBe(200);
		expect((await changed.json()).city).toBe('london');

		const [user] = await devQuery<{ city: string; user_city: string }>(
			`SELECT u.city, s.user_city FROM clubfindr.users u
			   JOIN clubfindr.user_sessions s ON s.user_id = u.id
			  WHERE u.general_email = $1`,
			[email]
		);
		expect(user).toEqual({ city: 'london', user_city: 'london' });

		// The same token keeps working, and a fresh login brings the new city
		expect((await (await api.get('/api/account/city', auth)).json()).city).toBe('london');
		const login = await api.post('/api/mobile/login', { data: { email, password: PASSWORD } });
		expect((await login.json()).user.city).toBe('london');
	} finally {
		await removeUser(email);
		await api.dispose();
	}
});

test('only covered cities are accepted, and only for a logged-in user', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = unique();
	try {
		expect((await api.get('/api/account/city')).status()).toBe(401);
		expect((await api.put('/api/account/city', { data: { city: 'paris' } })).status()).toBe(401);

		const { token } = await signUp(api, email, true);
		const auth = { headers: bearer(token) };
		for (const city of ['rome', '', 42, null]) {
			const refused = await api.put('/api/account/city', { ...auth, data: { city } });
			expect(refused.status(), `city ${JSON.stringify(city)}`).toBe(400);
		}
		const [user] = await devQuery<{ city: string }>(
			'SELECT city FROM clubfindr.users WHERE general_email = $1',
			[email]
		);
		expect(user.city.toLowerCase()).toBe('berlin');
	} finally {
		await removeUser(email);
		await api.dispose();
	}
});

test('/update-info changes the city, and the city cookie /clubs reads follows without a new login', async ({
	page,
	context
}) => {
	const email = unique();
	try {
		await page.goto('/');
		await acceptCookies(page);
		await signUp(page.request, email, false);

		await page.goto('/update-info');
		const picker = page.getByTestId('city-picker');
		await expect(picker.locator('select')).toHaveValue('berlin');
		await picker.locator('select').selectOption('paris');
		await picker.getByRole('button', { name: 'Save city' }).click();
		await expect(picker.getByRole('status')).toContainText('Your city is now Paris');

		const cityCookie = (await context.cookies()).find((c) => c.name === 'city');
		expect(cityCookie?.value).toBe('paris');
		await page.reload();
		await expect(page.getByTestId('city-picker').locator('select')).toHaveValue('paris');
	} finally {
		await removeUser(email);
	}
});
