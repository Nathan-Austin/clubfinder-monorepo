import type { Page } from '@playwright/test';
import { test, expect, acceptCookies, testPassword } from './fixtures';
import { devQuery } from './db';

// /users-home is where a logged-in user searches, from the account's city (owner's decision,
// 2026-11-18): "Current City" starts from users.city, Change City saves through
// PUT /api/account/city, and "Find events" posts exactly the shown city to the search cookies.
// The old flow guessed the city from the browser's location and posted the guess, so a saved
// city only lasted until the next search (DEVICE_CHECKLIST 2026-11-18, section 10).
//
// Each test signs up an account of its own (via page.request, which shares the page's cookie
// jar), so the seeded users keep their cities.

const PASSWORD = testPassword();
const unique = () =>
	`test-home-city-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;

async function signUp(page: Page, email: string) {
	const response = await page.request.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			isMobileApp: false,
			email,
			password: PASSWORD,
			fullName: 'Home City Test'
		}
	});
	expect(response.status(), await response.text()).toBe(200);
}

async function removeUser(email: string) {
	await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
}

async function cityCookie(page: Page) {
	const cookies = await page.context().cookies();
	return cookies.find((cookie) => cookie.name === 'city')?.value;
}

test('the saved city drives the page and the search, and survives a reload', async ({ page }) => {
	const email = unique();
	try {
		await signUp(page, email);
		const saved = await page.request.put('/api/account/city', { data: { city: 'Amsterdam' } });
		expect(saved.status(), await saved.text()).toBe(200);

		await page.goto('/users-home');
		await acceptCookies(page);
		await expect(page.getByTestId('current-city')).toHaveText('Amsterdam');

		await page.getByTestId('find-events').click();
		await page.waitForURL('**/clubs');
		// The search went out with the saved city, not a location guess, and the page names it
		// even when the city has no events that day (the empty return used to say "Unknown City")
		expect(await cityCookie(page)).toBe('amsterdam');
		await expect(page.locator('h1')).toContainText('Amsterdam');
		await expect(page.locator('h1')).not.toContainText('Unknown City');

		// Reload the profile page: still Amsterdam (from the account, not a cookie)
		await page.goto('/users-home');
		await expect(page.getByTestId('current-city')).toHaveText('Amsterdam');
	} finally {
		await removeUser(email);
	}
});

test('an account without a city picks one, and Change City saves to the account', async ({
	page
}) => {
	const email = unique();
	try {
		await signUp(page, email);
		// Like an account from before the city was saved at sign-up
		await devQuery(`UPDATE clubfindr.users SET city = '' WHERE general_email = $1`, [email]);

		await page.goto('/users-home');
		await acceptCookies(page);
		// No location permission in the test browser, so there is no guess either
		await expect(page.getByTestId('current-city')).toHaveText('Choose your city');

		// Find events without a city: the picker opens, the page stays
		await page.getByTestId('find-events').click();
		await expect(page.getByTestId('city-select')).toBeVisible();
		await expect(page).toHaveURL(/users-home/);

		await page.getByTestId('city-select').selectOption('amsterdam');
		await expect(page.getByTestId('city-message')).toHaveText('Your city is now Amsterdam.');
		await expect(page.getByTestId('current-city')).toHaveText('Amsterdam');

		const [user] = await devQuery<{ city: string }>(
			'SELECT city FROM clubfindr.users WHERE general_email = $1',
			[email]
		);
		expect(user.city).toBe('amsterdam');

		// And the search now runs from it
		await page.getByTestId('find-events').click();
		await page.waitForURL('**/clubs');
		expect(await cityCookie(page)).toBe('amsterdam');
	} finally {
		await removeUser(email);
	}
});
