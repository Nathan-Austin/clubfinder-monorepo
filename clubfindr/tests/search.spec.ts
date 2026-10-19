import { test, expect, acceptCookies, chooseCityAndGenre, login } from './fixtures';

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
		await expect(categories).toHaveCount(14);
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
