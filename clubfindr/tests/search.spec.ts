import { test, expect, acceptCookies, chooseCityAndGenre, login } from './fixtures';
import unifiedGenres from '../static/lib/unified-genres.json' with { type: 'json' };

test.describe('home page search', () => {
	test('city + genre -> /clubs lists matching events', async ({ page, pageErrors }) => {
		const menu = await chooseCityAndGenre(page, 'Berlin', 'Minimal and Techno');
		await menu.locator('button.submit-selection-button', { hasText: 'Find A club' }).click();
		await page.waitForURL('**/clubs');
		await expect(page.locator('h1')).toContainText('ClubFinder Berlin');
		await expect(page.locator('body')).toContainText('Found parties matching your music style');
		// Seeded Berlin techno events with their matching genres
		await expect(page.locator('body')).toContainText('Club:');
		await expect(page.locator('body')).toContainText('Matching Genres:');
		expect(pageErrors).toEqual([]);
	});

	test('city + genre -> /barfindr lists bars with a genre profile', async ({
		page,
		pageErrors
	}) => {
		const menu = await chooseCityAndGenre(page, 'Berlin', 'Minimal and Techno');
		await menu.locator('button.submit-selection-button', { hasText: 'Find A Bar' }).click();
		await page.waitForURL('**/barfindr');
		await expect(page.locator('body')).toContainText('The Copper Lantern');
		expect(pageErrors).toEqual([]);
	});

	test('"Change the vibe" returns to / with the city still selected', async ({ page }) => {
		const menu = await chooseCityAndGenre(page, 'Berlin', 'Minimal and Techno');
		await menu.locator('button.submit-selection-button', { hasText: 'Find A club' }).click();
		await page.waitForURL('**/clubs');
		await page.getByRole('button', { name: 'Change the vibe' }).click();
		await page.waitForURL(/\/$/);
		await expect(page.locator('#city-select')).toHaveValue('Berlin');
		// And a reload keeps it too: the city comes from the search's cookie, not page state
		await page.reload();
		await expect(page.locator('#city-select')).toHaveValue('Berlin');
	});

	// KNOWN_ISSUES 24: /clubs deleted the genre cookies on first read, so one page view spent
	// a guest's genres — a reload, "Change Date" or a hop to /barfindr showed everything,
	// unfiltered, and the changed date never reached the cookie the other pages search by.
	test('a guest keeps their genres and changed date across reloads and pages', async ({ page }) => {
		const menu = await chooseCityAndGenre(page, 'Berlin', 'Minimal and Techno');
		await menu.locator('button.submit-selection-button', { hasText: 'Find A club' }).click();
		await page.waitForURL('**/clubs');
		await expect(page.locator('body')).toContainText('Matching Genres:');

		// A reload used to lose the genres with the deleted cookie
		await page.reload();
		await expect(page.locator('body')).toContainText('Matching Genres:');

		// "Change Date" to the pinned seed nights keeps the genres and refreshes the date cookie
		await page.locator('input[name="date"]').fill('2031-06-21');
		await page.getByRole('button', { name: 'Change Date' }).click();
		await page.waitForURL('**/clubs?date=2031-06-21');
		await expect(page.locator('.header')).toContainText('June 21');
		await expect(page.locator('body')).toContainText('Matching Genres:');

		// /barfindr searches by the cookies alone: the genres and the changed date both arrive
		await page.goto('/barfindr');
		await expect(page.locator('.header')).toContainText('June 21');
		await expect(page.locator('body')).toContainText('The Copper Lantern');
	});

	test('the home page remembers a changed date, not just the city', async ({ page }) => {
		// The date display and picker only exist logged in; guests always search "today".
		// ("Change the vibe" is window.history.back(), so after a date change it first returns
		// to the pre-change /clubs entry; going home directly asserts the same cookie read.)
		await login(page, 'listener');
		const menu = await chooseCityAndGenre(page, 'Berlin', 'Minimal and Techno');
		await menu.locator('button.submit-selection-button', { hasText: 'Find A club' }).click();
		await page.waitForURL('**/clubs');

		// Tomorrow, not the pinned 2031 nights: the home DatePicker clamps to its own range,
		// so a far-future remembered date would show clamped, not as picked
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const iso = [
			tomorrow.getFullYear(),
			String(tomorrow.getMonth() + 1).padStart(2, '0'),
			String(tomorrow.getDate()).padStart(2, '0')
		].join('-');
		await page.locator('input[name="date"]').fill(iso);
		await page.getByRole('button', { name: 'Change Date' }).click();
		await page.waitForURL(`**/clubs?date=${iso}`);

		// Back on the home page the search date is the changed one, not today again
		await page.goto('/');
		const displayed = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
		await expect(page.locator('body')).toContainText(displayed);
		await expect(page.locator('#city-select')).toHaveValue('Berlin');
	});

	test('logged-in user can mark interest on a club result', async ({ page }) => {
		await login(page, 'listener');
		const menu = await chooseCityAndGenre(page, 'Berlin', 'Minimal and Techno');
		await menu.locator('button.submit-selection-button', { hasText: 'Find A club' }).click();
		await page.waitForURL('**/clubs');
		const ticks = page.locator('button.green-tick');
		await expect(ticks.first()).toBeVisible();
		await ticks.first().click();
		await expect(page.locator('span.green-tick').first()).toBeVisible();
	});
});

test.describe('genre picker', () => {
	test('requires a city before searching', async ({ page }) => {
		await page.goto('/');
		await acceptCookies(page);
		await page.locator('input.custom-genre-input').click();
		await page.locator('button.submit-selection-button', { hasText: 'Find A club' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('#city-select')).toBeVisible();
	});

	test('browse categories, select all, search, clear and close', async ({ page }) => {
		await page.goto('/');
		await acceptCookies(page);
		await page.locator('#city-select').selectOption('Berlin');
		await page.locator('input.custom-genre-input').click();
		const menu = page.locator('.dropdown-menu');
		const selected = page.locator('input[name="selectedGenre"]');

		// category -> subgenre level
		const categories = menu.locator('.dropdown-list button');
		// Counted from the picker's own data rather than hard-coded, so adding a genre cluster
		// does not fail this test while a picker that drops one still does.
		await expect(categories).toHaveCount(unifiedGenres.categories.length);
		await categories.first().click();
		await expect(menu.locator('button', { hasText: 'Back to Categories' })).toBeVisible();
		await menu.locator('button', { hasText: 'Select All' }).click();
		await expect(selected).not.toHaveValue('');
		const afterSelectAll = await selected.inputValue();
		expect(afterSelectAll.split(',').length).toBeGreaterThan(1);
		await menu.locator('button', { hasText: 'Back to Categories' }).click();

		// search adds to the selection and highlights the result
		await menu.getByPlaceholder('Search genres...').fill('techno');
		await menu.locator('button', { hasText: 'Minimal and Techno' }).first().click();
		await expect(selected).toHaveValue(/Minimal and Techno/);
		await expect(menu.locator('button.selected')).toHaveCount(1);

		// clearing the selection also closes the picker
		await menu.locator('.clear-selection-button').click();
		await expect(selected).toHaveValue('');
		await expect(menu).toHaveCount(0);

		await page.locator('input.custom-genre-input').click();
		await expect(menu).toBeVisible();
		await menu.locator('.dropdown-menu-close').click();
		await expect(menu).toHaveCount(0);
	});
});
