import { test, expect, acceptCookies, mobileApi } from './fixtures';

// The guest "Artist or song…" search on the home page: /spotify/search looks the query up with
// the app's own Spotify token (no user login; tests/mock-spotify.ts stands in for Spotify), the
// visitor picks artists, and /api/spotify/artists turns them into genres for /clubs.
test.describe('guest artist-or-song search', () => {
	test('search, pick an artist and carry its genres to /clubs', async ({ page, pageErrors }) => {
		await page.goto('/');
		await acceptCookies(page);
		await page.locator('#city-select').selectOption('Berlin');
		await page.getByPlaceholder('Artist or song...').fill('juno');
		await page.locator('a[href="/search"]').click();

		await page.waitForURL('**/spotify/search');
		const artist = page.locator('.section.artists .item', { hasText: 'Juno Paperplane' });
		await expect(artist).toBeVisible();

		await page.getByRole('button', { name: 'View Tracks' }).click();
		await expect(page.locator('.section.tracks')).toContainText(
			'Paper Planes at Dawn by Juno Paperplane'
		);
		await page.getByRole('button', { name: 'View Artists' }).click();

		await artist.click();
		await expect(page.locator('body')).toContainText('1 selected');
		await page.getByRole('button', { name: 'Search for Clubs' }).click();
		await page.waitForURL('**/clubs');
		await expect(page.locator('h1')).toContainText('ClubFinder Berlin');

		// The picked artist's genres stay with this visitor (KNOWN_ISSUES 23)
		const mine = await (await page.request.get('/api/spotify/artists')).json();
		expect(mine.genresList.toSorted()).toEqual(['deep house', 'minimal']);
		expect(pageErrors).toEqual([]);
	});

	test('the genres of picked artists stay with their own visitor (KNOWN_ISSUES 23)', async ({
		page,
		playwright,
		baseURL
	}) => {
		await page.goto('/');
		const post = await page.request.post('/api/spotify/artists', {
			data: { selectedIds: ['devJunoPaperplane00001', 'devVelvetMeridian00001'] }
		});
		expect(post.status()).toBe(200);
		const posted = (await post.json()).genresList.toSorted();
		expect(posted).toEqual(['deep house', 'italo disco', 'minimal', 'nu disco']);

		// The same visitor reads them back (what the /selectedGenres load does)
		const mine = await (await page.request.get('/api/spotify/artists')).json();
		expect(mine.genresList.toSorted()).toEqual(posted);

		// A visitor without that cookie gets nothing: the genres used to live in a module-level
		// variable, so anyone's GET returned whichever user's artists were fetched last
		const stranger = await mobileApi(playwright, baseURL);
		const theirs = await (await stranger.get('/api/spotify/artists')).json();
		expect(theirs.genresList).toEqual([]);
		await stranger.dispose();
	});

	test('only Spotify-shaped ids reach Spotify', async ({ page }) => {
		await page.goto('/');
		const bad = await page.request.post('/api/spotify/artists', {
			data: { selectedIds: ['x&type=track', '../me'] }
		});
		expect(bad.status()).toBe(400);
	});

	test('an expired search says so instead of failing', async ({ page, pageErrors }) => {
		await page.goto('/spotify/search');
		await expect(page.locator('.message')).toContainText('Your search session has expired');
		expect(pageErrors).toEqual([]);
	});
});
