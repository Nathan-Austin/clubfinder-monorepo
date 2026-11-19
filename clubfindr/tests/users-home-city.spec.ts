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

		// The same block searches bars too (owner 2026-11-19: the page used to reach /clubs only)
		await page.getByTestId('find-bars').click();
		await page.waitForURL('**/barfindr');
		expect(await cityCookie(page)).toBe('amsterdam');
	} finally {
		await removeUser(email);
	}
});

test('an account without a city picks one, and Change City saves to the account', async ({
	page
}) => {
	const email = unique();
	try {
		// A new account starts without a city (owner's decision 2026-11-18); the page is where
		// one is proposed and chosen
		await signUp(page, email);

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

// The 2026-11-19 device run reported /clubs with "Berlin" in the heading and Amsterdam's clubs
// on the cards after the city had been changed from Amsterdam to Berlin on /update-info. The
// heading and the cards come from one load and one city, so this walks the owner's exact path
// and holds every card to the heading's city, both before and after the change.
test('changing the city on /update-info moves the search: the cards follow the heading', async ({
	page,
	baseURL
}) => {
	const email = unique();
	try {
		await signUp(page, email);
		const saved = await page.request.put('/api/account/city', { data: { city: 'Amsterdam' } });
		expect(saved.status(), await saved.text()).toBe(200);

		// A night with club events in both cities (the seed's relative nights), and what each
		// city has on that night, straight from the database
		const dates = await devQuery<{ event_date: string }>(
			`SELECT event_date::text AS event_date FROM clubfindr.events
			 WHERE city IN ('amsterdam', 'berlin') AND event_date >= CURRENT_DATE
			 GROUP BY event_date HAVING count(DISTINCT city) = 2
			 ORDER BY event_date LIMIT 1`
		);
		expect(dates, 'the seed has a night with events in both cities').toHaveLength(1);
		const date = dates[0].event_date;
		const clubsIn = async (city: string) =>
			(
				await devQuery<{ club_name: string }>(
					'SELECT DISTINCT club_name FROM clubfindr.events WHERE city = $1 AND event_date = $2',
					[city, date]
				)
			).map((row) => row.club_name);
		const amsterdamClubs = await clubsIn('amsterdam');
		const berlinClubs = await clubsIn('berlin');

		// An explicit genre pick wide enough to reach every seeded night, so the city alone
		// decides which cards show
		await page.context().addCookies([
			{
				name: 'selected-genres',
				value: 'techno,house,uk garage,dubstep,ambient,post-punk,reggaeton',
				url: baseURL ?? 'http://localhost:4173'
			}
		]);
		const cardClubs = () => page.locator('.club-value span').allTextContents();

		await page.goto('/users-home');
		await acceptCookies(page);
		await expect(page.getByTestId('current-city')).toHaveText('Amsterdam');
		await page.getByTestId('find-events').click();
		await page.waitForURL('**/clubs');
		// "Change Date" to the night: the city stays what the search posted
		await page.goto(`/clubs?date=${date}`);
		await expect(page.locator('h1')).toContainText('Amsterdam');
		const amsterdamCards = await cardClubs();
		expect(amsterdamCards.length).toBeGreaterThan(0);
		for (const club of amsterdamCards) expect(amsterdamClubs).toContain(club);

		// The owner's path: change the city on the profile page, then search again from the
		// user home
		await page.goto('/update-info');
		await acceptCookies(page);
		const picker = page.getByTestId('city-picker');
		await picker.locator('select').selectOption('berlin');
		await picker.getByRole('button', { name: 'Save city' }).click();
		await expect(picker.getByRole('status')).toContainText('Your city is now Berlin');

		await page.goto('/users-home');
		await expect(page.getByTestId('current-city')).toHaveText('Berlin');
		await page.getByTestId('find-events').click();
		await page.waitForURL('**/clubs');
		await page.goto(`/clubs?date=${date}`);
		await expect(page.locator('h1')).toContainText('Berlin');
		const berlinCards = await cardClubs();
		expect(berlinCards.length).toBeGreaterThan(0);
		for (const club of berlinCards) {
			expect(berlinClubs).toContain(club);
			expect(amsterdamClubs).not.toContain(club);
		}
	} finally {
		await removeUser(email);
	}
});
