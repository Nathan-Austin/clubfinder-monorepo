import { test, expect, login, mobileApi } from './fixtures';

// Promoter dashboard: the "Add New Event" form with its venue search (local API),
// GenreSelector and the ArtistSearchForm/TrackSearch performer components.
test.describe('promoter event form', () => {
	test.beforeEach(async ({ page }) => {
		await login(page, 'promoter');
		await page.getByRole('button', { name: 'Add New Event' }).click();
		await expect(page.locator('h2', { hasText: 'Add New Event' })).toBeVisible();
	});

	test('venue search suggests seeded venues and selecting one fills the form', async ({ page }) => {
		await page.getByPlaceholder('Search for a venue or enter a new one').fill('Parallax');
		const suggestion = page.locator('button', { hasText: 'Parallax Cellar' }).first();
		await expect(suggestion).toBeVisible();
		await suggestion.click();
		await expect(page.locator('body')).toContainText('Parallax Cellar');
	});

	test('genre selector: open, expand, search, select and remove', async ({ page, pageErrors }) => {
		await page.getByRole('button', { name: 'Select genres' }).click();
		await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();

		// expanding a main genre reveals its sub genres
		const mainGenres = page.locator('button.font-semibold');
		const before = await mainGenres.count();
		await mainGenres.first().click();
		await expect(mainGenres).not.toHaveCount(before);

		// search and pick
		await page.getByPlaceholder('Search genres...').fill('techno');
		const hit = page.locator('button.w-full.text-left', { hasText: /techno/i }).first();
		const picked = (await hit.innerText()).trim();
		await hit.click();
		const chips = page.locator('span.bg-blue-100');
		await expect(chips.filter({ hasText: picked })).toHaveCount(1);

		// remove the chip again
		await chips.filter({ hasText: picked }).locator('button').click();
		await expect(chips.filter({ hasText: picked })).toHaveCount(0);

		await page.getByRole('button', { name: 'Close menu' }).click();
		await expect(page.getByRole('button', { name: 'Select genres' })).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test('performer form: add, fill, expand/collapse and remove', async ({ page, pageErrors }) => {
		await page.getByRole('button', { name: 'Add Performer' }).first().click();
		const name = page.locator('#artist_name_0');
		await expect(name).toBeVisible();
		await name.fill('DJ Smoke Test');
		await page.locator('#email_0').fill('dj@clubfindr.test');
		// the performer list header reflects the typed name
		await expect(page.locator('body')).toContainText('DJ Smoke Test');

		// artist search runs against the local API (no results for a made-up name, no crash)
		await page.getByPlaceholder('Search by artist name or email').fill('zzz-nobody');
		await page.waitForTimeout(800);

		// track search goes through the app's own Spotify token (tests/mock-spotify.ts), so a
		// promoter with no Spotify login of their own gets results and can pick one
		const trackSearch = page.getByPlaceholder('Search for tracks to add...');
		await trackSearch.fill('paper planes');
		await trackSearch.press('Enter');
		await expect(page.getByText('Paper Planes at Dawn').first()).toBeVisible();
		await page.getByRole('button', { name: 'Add Track' }).first().click();
		await expect(page.locator('body')).toContainText('Paper Planes at Dawn - Juno Paperplane');
		expect(pageErrors).toEqual([]);
	});

	test('track search is refused without a login', async ({ playwright, baseURL }) => {
		const stranger = await mobileApi(playwright, baseURL);
		const response = await stranger.get('/api/spotify/search?q=paper&type=track');
		expect(response.status()).toBe(401);
		await stranger.dispose();
	});
});
