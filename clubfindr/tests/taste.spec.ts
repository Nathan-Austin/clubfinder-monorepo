import { test, expect, login, acceptCookies, USERS, type Page } from './fixtures';

// Taste profile: favourite artists (docs/taste-profile-design.md). The JSON endpoints are
// called through the browser context after a real login, which carries the session cookie,
// and the picker on / is driven through the page. Nothing reaches the internet: the seeded
// favourites have their genres stored, and the server's Spotify calls go to
// tests/mock-spotify.ts (see playwright.config.ts), whose artists are as invented as the seed.
//
// The tests here log in as the seeded taste users (`fan`, `newcomer`), and a login deletes the
// user's other sessions (/login/users), so the API calls of a parallel test would get 401. This
// file therefore runs its tests in order in one worker, and no other spec may log in as them.
// Each test also starts from (and leaves behind) the seeded favourites, so a run that was
// interrupted half-way cannot break the next one.
test.describe.configure({ mode: 'default' });

const SEEDED_GENRES = [
	'afro house',
	'amapiano',
	'deep house',
	'dub techno',
	'minimal',
	'minimal techno'
];
const SEEDED_SOURCE_IDS = [
	'devJunoPaperplane00001',
	'devKasimirLow000000001',
	'devTamsinOkra000000001'
];

/** Removes every favourite that is not part of the seed, through the API. */
async function resetFavourites(page: Page) {
	const profile = await (await page.request.get('/api/taste/artists')).json();
	for (const artist of profile.artists as { id: string; sourceId: string }[]) {
		if (!SEEDED_SOURCE_IDS.includes(artist.sourceId)) {
			expect((await page.request.delete(`/api/taste/artists/${artist.id}`)).status()).toBe(200);
		}
	}
}

test.describe('favourite artists API', () => {
	test('needs a login', async ({ page }) => {
		await page.goto('/');
		await acceptCookies(page);
		// Logged out: no picker on the home page and no API access
		await expect(page.getByTestId('taste-profile')).toHaveCount(0);
		expect((await page.request.get('/api/taste/artists')).status()).toBe(401);
		expect((await page.request.get('/api/taste/search?q=juno')).status()).toBe(401);
	});

	test.describe('logged in as the seeded fan', () => {
		test.beforeEach(async ({ page }) => {
			await login(page, 'fan');
			await resetFavourites(page);
		});

		test.afterEach(async ({ page }) => {
			await resetFavourites(page);
		});

		test('lists the seeded favourites and their genre profile', async ({ page }) => {
			const response = await page.request.get('/api/taste/artists');
			expect(response.status()).toBe(200);
			const profile = await response.json();
			expect(profile.artists.map((a: { name: string }) => a.name)).toEqual([
				'Juno Paperplane',
				'Kasimir Low',
				'Tamsin Okra'
			]);
			expect(profile.artists[0]).toMatchObject({
				source: 'spotify',
				sourceId: 'devJunoPaperplane00001',
				genres: ['deep house', 'minimal']
			});
			expect(profile.genres).toEqual(SEEDED_GENRES);
		});

		test('adds a catalogued artist without Spotify, then removes it again', async ({ page }) => {
			const added = await page.request.post('/api/taste/artists', {
				data: { sourceId: 'devPerihelionChoir0001' }
			});
			expect(added.status()).toBe(201);
			const body = await added.json();
			expect(body.created).toBe(true);
			expect(body.artist).toMatchObject({
				name: 'Perihelion Choir',
				genres: ['ambient', 'modern classical']
			});
			expect(body.genres).toEqual(
				[...SEEDED_GENRES, 'ambient', 'modern classical'].sort((a, b) => a.localeCompare(b))
			);

			// Adding it twice is fine and changes nothing
			const again = await page.request.post('/api/taste/artists', {
				data: { sourceId: 'devPerihelionChoir0001' }
			});
			expect(again.status()).toBe(200);
			expect((await again.json()).created).toBe(false);

			const removed = await page.request.delete(`/api/taste/artists/${body.artist.id}`);
			expect(removed.status()).toBe(200);
			expect((await removed.json()).genres).toEqual(SEEDED_GENRES);

			const gone = await page.request.delete(`/api/taste/artists/${body.artist.id}`);
			expect(gone.status()).toBe(404);
		});

		test('searches the catalogue and the (mock) Spotify together', async ({ page }) => {
			const tooShort = await page.request.get('/api/taste/search?q=j');
			expect(tooShort.status()).toBe(400);

			// "perihelion": Perihelion Choir is seeded in the catalogue and on (mock) Spotify, so it
			// appears once, catalogue first; Perihelion Drift comes from Spotify. Whether Drift is
			// also catalogued depends on earlier runs (the catalogue is a cache that the seed reload
			// clears but the favourites reset does not), so only its presence is asserted.
			const data = await (await page.request.get('/api/taste/search?q=perihelion')).json();
			expect(data.warning).toBeUndefined();
			expect(data.artists.map((a: { name: string }) => a.name)).toEqual([
				'Perihelion Choir',
				'Perihelion Drift'
			]);
			expect(data.artists[0]).toMatchObject({
				catalogueId: '00000000-0000-4000-8000-0000000000d4',
				favourite: false
			});
			expect(data.artists[1]).toMatchObject({ favourite: false });

			// A seeded favourite is flagged as such
			const juno = await (await page.request.get('/api/taste/search?q=juno')).json();
			expect(juno.artists[0]).toMatchObject({ name: 'Juno Paperplane', favourite: true });
		});

		test('rejects bad input and reports what Spotify says about unknown artists', async ({
			page
		}) => {
			const noId = await page.request.post('/api/taste/artists', { data: {} });
			expect(noId.status()).toBe(400);

			const badSource = await page.request.post('/api/taste/artists', {
				data: { source: 'soundcloud', sourceId: 'x' }
			});
			expect(badSource.status()).toBe(400);

			const notUuid = await page.request.delete('/api/taste/artists/not-a-uuid');
			expect(notUuid.status()).toBe(400);

			// Not in the catalogue, so the server asks (the mock) Spotify, which does not know it
			const unknown = await page.request.post('/api/taste/artists', {
				data: { sourceId: 'devUnknownArtist000001' }
			});
			expect(unknown.status()).toBe(404);
			expect((await unknown.json()).message).toContain('Spotify');

			// The failed attempt left the profile alone
			const profile = await (await page.request.get('/api/taste/artists')).json();
			expect(profile.genres).toEqual(SEEDED_GENRES);
		});

		test('adds an artist only Spotify knows, storing its genres', async ({ page }) => {
			const added = await page.request.post('/api/taste/artists', {
				data: { sourceId: 'devVelvetMeridian00001' }
			});
			expect(added.status()).toBe(201);
			const body = await added.json();
			expect(body.artist).toMatchObject({
				name: 'Velvet Meridian',
				genres: ['italo disco', 'nu disco']
			});
			expect(body.genres).toContain('nu disco');
			// Now catalogued: the search flags it as a favourite from the catalogue
			const search = await (await page.request.get('/api/taste/search?q=velvet')).json();
			expect(search.artists[0]).toMatchObject({ favourite: true, catalogueId: body.artist.id });
		});
	});
});

test.describe('empty taste profile', () => {
	test('a user without favourites gets an empty profile and the empty states', async ({
		page,
		pageErrors
	}) => {
		await login(page, 'newcomer');
		const profile = await (await page.request.get('/api/taste/artists')).json();
		expect(profile).toEqual({ artists: [], genres: [] });

		await page.goto('/');
		await acceptCookies(page);
		const picker = page.getByTestId('taste-profile');
		await expect(picker).toBeVisible();
		await expect(picker.getByTestId('taste-favourite')).toHaveCount(0);
		await expect(picker.getByTestId('taste-empty')).toContainText('No favourite artists yet');
		await expect(picker.getByTestId('taste-genre')).toHaveCount(0);
		await expect(picker).toContainText('Add an artist and its genres show up here.');
		expect(pageErrors).toEqual([]);
	});
});

test.describe('favourite-artist picker on /', () => {
	test.beforeEach(async ({ page }) => {
		await login(page, 'fan');
		await resetFavourites(page);
		await page.goto('/');
		await acceptCookies(page);
	});

	test.afterEach(async ({ page }) => {
		await resetFavourites(page);
	});

	test('is linked from the user home page', async ({ page }) => {
		await page.goto('/users-home');
		await acceptCookies(page);
		const card = page.getByTestId('taste-card');
		await expect(card).toContainText('Favourite artists');
		await card.getByRole('link', { name: 'Edit your taste profile' }).click();
		await expect(page).toHaveURL(/\/#taste-profile$/);
		await expect(page.getByTestId('taste-profile')).toBeVisible();
	});

	test('shows the seeded favourites and their genres', async ({ page, pageErrors }) => {
		const picker = page.getByTestId('taste-profile');
		await expect(picker).toBeVisible();
		await expect(picker.getByTestId('taste-favourite')).toHaveText([
			/Juno Paperplane/,
			/Kasimir Low/,
			/Tamsin Okra/
		]);
		await expect(picker.getByTestId('taste-genre')).toHaveText(SEEDED_GENRES);
		expect(pageErrors).toEqual([]);
	});

	test('search, add and remove an artist; the genre profile follows', async ({
		page,
		pageErrors
	}) => {
		const picker = page.getByTestId('taste-profile');
		const favourites = picker.getByTestId('taste-favourite');
		const genres = picker.getByTestId('taste-genre');
		await expect(favourites).toHaveCount(3);

		await picker.getByTestId('taste-search').fill('perihelion');
		const results = picker.getByTestId('taste-result');
		await expect(results).toHaveText([/Perihelion Choir/, /Perihelion Drift/]);
		await expect(results.nth(1)).toContainText('ambient techno, dub techno');
		await expect(picker.locator('.taste-warning')).toHaveCount(0);

		// Add the artist only (mock) Spotify knows: one new favourite, one new genre
		// ("dub techno" was already there from Kasimir Low; the profile is a set)
		await picker.getByRole('button', { name: 'Add Perihelion Drift' }).click();
		await expect(favourites).toHaveCount(4);
		await expect(favourites.last()).toContainText('Perihelion Drift');
		await expect(genres).toHaveText([...SEEDED_GENRES, 'ambient techno'].sort());
		await expect(results.nth(1)).toContainText('Added');
		await expect(picker.getByRole('button', { name: 'Add Perihelion Drift' })).toHaveCount(0);

		// The server agrees
		const saved = await (await page.request.get('/api/taste/artists')).json();
		expect(saved.artists.map((a: { name: string }) => a.name)).toContain('Perihelion Drift');
		expect(saved.genres).toContain('ambient techno');

		// Remove it again from the chip: favourites, genres and the result row all follow
		await picker.getByRole('button', { name: 'Remove Perihelion Drift' }).click();
		await expect(favourites).toHaveCount(3);
		await expect(genres).toHaveText(SEEDED_GENRES);
		await expect(picker.getByRole('button', { name: 'Add Perihelion Drift' })).toBeVisible();

		const after = await (await page.request.get('/api/taste/artists')).json();
		expect(after.genres).toEqual(SEEDED_GENRES);
		expect(pageErrors).toEqual([]);
	});

	test('removing a seeded favourite drops its genres', async ({ page }) => {
		const picker = page.getByTestId('taste-profile');
		await picker.getByRole('button', { name: 'Remove Tamsin Okra' }).click();
		await expect(picker.getByTestId('taste-favourite')).toHaveCount(2);
		await expect(picker.getByTestId('taste-genre')).toHaveText([
			'deep house',
			'dub techno',
			'minimal',
			'minimal techno'
		]);

		// Put it back through the picker: the artist is in the catalogue, so no Spotify needed
		await picker.getByTestId('taste-search').fill('tamsin');
		await picker.getByRole('button', { name: 'Add Tamsin Okra' }).click();
		await expect(picker.getByTestId('taste-favourite')).toHaveCount(3);
		await expect(picker.getByTestId('taste-genre')).toHaveText(SEEDED_GENRES);
	});

	test('no results and clearing the search', async ({ page }) => {
		const picker = page.getByTestId('taste-profile');
		await picker.getByTestId('taste-search').fill('zzz nobody');
		await expect(picker.getByTestId('taste-no-results')).toContainText('zzz nobody');
		await picker.getByRole('button', { name: 'Clear search' }).click();
		await expect(picker.getByTestId('taste-search')).toHaveValue('');
		await expect(picker.getByTestId('taste-no-results')).toHaveCount(0);
	});
});

test.describe('signup without Spotify', () => {
	test('the Spotify e-mail field is optional', async ({ page }) => {
		await page.goto(USERS.fan.loginPath);
		await acceptCookies(page);
		const form = page.locator('form.login-form');
		await form.locator('input[type="checkbox"]').check();
		const spotifyEmail = form.locator('#spotifyEmail');
		await expect(spotifyEmail).toBeVisible();
		await expect(spotifyEmail).not.toHaveAttribute('required', /.*/);
		await expect(form.locator('label[for="spotifyEmail"]')).toContainText('optional');
	});
});

test.describe('the taste profile drives /clubs and /barfindr', () => {
	// dev/seed.sql puts four Berlin nights on this fixed date, so the expectations below do not
	// depend on when the seed was loaded (the other events are relative to the seed date).
	const PINNED_DATE = '2031-06-21';
	// What the fan's seeded profile (house, techno, afro house) reaches on that date...
	const PROFILE_NIGHTS = ['Velour at Hollow Moon Club', 'Glasshouse at Parallax Cellar'];
	// ...and what only the mock artist Basement Omnivore's genres reach
	const OMNIVORE_NIGHTS = ['Calor at Neon Heron', 'Night Shift Rock at Halle Nimbus'];

	test.beforeEach(async ({ page }) => {
		await login(page, 'fan');
		await resetFavourites(page);
	});

	test.afterEach(async ({ page }) => {
		await resetFavourites(page);
	});

	/**
	 * From /, with Berlin selected, starts a search with the taste profile and waits for it.
	 * For clubs it then switches to the pinned date (the page's own "Change Date" form does the
	 * same `?date=` reload); the city cookie and the profile fallback carry over.
	 */
	async function findWithTaste(page: Page, target: 'clubs' | 'bars') {
		await page.goto('/');
		await acceptCookies(page);
		await page.locator('#city-select').selectOption('Berlin');
		await page.getByTestId(`taste-find-${target}`).click();
		await page.waitForURL(target === 'clubs' ? '**/clubs' : '**/barfindr');
		if (target === 'clubs') {
			await page.goto(`/clubs?date=${PINNED_DATE}`);
		}
	}

	async function addOmnivore(page: Page) {
		await page.goto('/');
		await acceptCookies(page);
		const picker = page.getByTestId('taste-profile');
		await picker.getByTestId('taste-search').fill('omnivore');
		await picker.getByRole('button', { name: 'Add Basement Omnivore' }).click();
		await expect(picker.getByTestId('taste-favourite')).toHaveCount(4);
	}

	async function removeOmnivore(page: Page) {
		await page.goto('/');
		await acceptCookies(page);
		const picker = page.getByTestId('taste-profile');
		await picker.getByRole('button', { name: 'Remove Basement Omnivore' }).click();
		await expect(picker.getByTestId('taste-favourite')).toHaveCount(3);
	}

	test('the search needs a city, like the genre picker', async ({ page }) => {
		await page.goto('/');
		await acceptCookies(page);
		await page.getByTestId('taste-find-clubs').click();
		await expect(page.locator('#city-select')).toHaveClass(/isInvalid/);
		await expect(page).toHaveURL(/\/$/);
	});

	test('"Change the vibe" keeps the city for the next taste search', async ({ page }) => {
		await findWithTaste(page, 'clubs');
		await page.getByRole('button', { name: 'Change the vibe' }).click();
		await page.waitForURL(/\/clubs$/); // back from ?date= to the first /clubs load
		await page.getByRole('button', { name: 'Change the vibe' }).click();
		await page.waitForURL(/\/$/);
		await expect(page.locator('#city-select')).toHaveValue('Berlin');
		// Searching again works without touching the city selector
		await page.getByTestId('taste-find-bars').click();
		await page.waitForURL('**/barfindr');
		await expect(page.locator('body')).toContainText('The Copper Lantern');
	});

	test('/clubs: add an artist, results change; remove it, they change back', async ({
		page,
		pageErrors
	}) => {
		await findWithTaste(page, 'clubs');
		await expect(page.locator('h1')).toContainText('ClubFinder Berlin');
		await expect(page.locator('body')).toContainText('June 21');
		const events = page.locator('a.event-link');
		// The seeded profile reaches the house and techno nights only
		await expect(events).toHaveText(PROFILE_NIGHTS);

		// With the omnivore's genres the Latin and rock nights match too; Calor shares the most
		// clusters with the profile and ranks first
		await addOmnivore(page);
		await findWithTaste(page, 'clubs');
		await expect(events).toHaveCount(4);
		const changed = await events.allTextContents();
		expect(changed[0]).toBe('Calor at Neon Heron');
		expect(changed.sort()).toEqual([...PROFILE_NIGHTS, ...OMNIVORE_NIGHTS].sort());

		await removeOmnivore(page);
		await findWithTaste(page, 'clubs');
		await expect(events).toHaveText(PROFILE_NIGHTS);
		expect(pageErrors).toEqual([]);
	});

	test('/barfindr: the match percentages follow the favourite artists', async ({
		page,
		pageErrors
	}) => {
		const copperLantern = page.locator('.poster', { hasText: 'The Copper Lantern' });
		const badge = copperLantern.locator('.similarity-badge');

		await findWithTaste(page, 'bars');
		await expect(badge).toBeVisible();
		const baseline = await badge.textContent();
		expect(baseline).toMatch(/\d+% Match/);
		const baselineBars = await page.locator('.similarity-badge').allTextContents();

		// More favourite genres the bar does not play dilute its match
		await addOmnivore(page);
		await findWithTaste(page, 'bars');
		await expect(badge).toBeVisible();
		expect(await badge.textContent()).not.toBe(baseline);
		expect(await page.locator('.similarity-badge').allTextContents()).not.toEqual(baselineBars);

		await removeOmnivore(page);
		await findWithTaste(page, 'bars');
		await expect(badge).toHaveText(baseline!);
		expect(await page.locator('.similarity-badge').allTextContents()).toEqual(baselineBars);
		expect(pageErrors).toEqual([]);
	});

	test('genres picked for a search win over the profile', async ({ page }) => {
		// Picking a genre in the menu and searching ignores the profile: a pick the profile does
		// not contain (Salsa Styles) finds only Latin nights and none of the profile's house/techno
		await page.goto('/');
		await acceptCookies(page);
		await page.locator('#city-select').selectOption('Berlin');
		await page.locator('input.custom-genre-input').click();
		const menu = page.locator('.dropdown-menu');
		await menu.getByPlaceholder('Search genres...').fill('Salsa Styles');
		await menu.locator('button', { hasText: 'Salsa Styles' }).first().click();
		await menu.locator('button.submit-selection-button', { hasText: 'Find A club' }).click();
		await page.waitForURL('**/clubs');
		const body = await page.locator('body').textContent();
		expect(body).not.toContain('Velour');
		expect(body).not.toContain('Subsurface');
	});
});

test.describe('Last.fm import on /users-home', () => {
	test.beforeEach(async ({ page }) => {
		await login(page, 'fan');
		await resetFavourites(page);
		await page.goto('/users-home');
		await acceptCookies(page);
	});

	test.afterEach(async ({ page }) => {
		await resetFavourites(page);
	});

	async function importUser(page: Page, username: string) {
		const form = page.getByTestId('lastfm-import');
		await form.getByTestId('lastfm-username').fill(username);
		await form.getByTestId('lastfm-submit').click();
		return form;
	}

	test('imports the top artists, maps their tags to genres, skips known ones', async ({
		page,
		pageErrors
	}) => {
		const form = await importUser(page, 'fanatic');
		const result = form.getByTestId('lastfm-result');
		await expect(result).toBeVisible();
		// Juno Paperplane is already a favourite; the other three are new
		await expect(result).toContainText(
			'Imported 3 artists from fanatic: Velvet Meridian, Perihelion Drift, Unlabelled Static.'
		);
		await expect(result).toContainText('Skipped (already a favourite): Juno Paperplane');
		// Only noise tags ("seen live", "favourites") -> no genres, and the user is told
		await expect(result).toContainText('No recognisable genres for: Unlabelled Static');
		// Tags the classifier knows became genres ("seen live" and the artist's own name did not)
		await expect(result).toContainText('disco');
		await expect(result).toContainText('ambient techno');
		await expect(result).not.toContainText('seen live');

		const profile = await (await page.request.get('/api/taste/artists')).json();
		const byName = Object.fromEntries(
			profile.artists.map((a: { name: string; source: string; genres: string[] }) => [a.name, a])
		);
		// Artists already in the catalogue from Spotify (earlier tests, or earlier runs) are
		// reused with their Spotify genres, so only what both providers agree on is asserted
		expect(byName['Velvet Meridian'].genres.join(' ')).toContain('disco');
		expect(byName['Velvet Meridian'].genres).not.toContain('velvet meridian');
		expect(byName['Perihelion Drift'].genres).toEqual(
			expect.arrayContaining(['ambient techno', 'dub techno'])
		);
		expect(byName['Unlabelled Static'].genres).toEqual([]);
		expect(profile.genres).toEqual(expect.arrayContaining([...SEEDED_GENRES, 'ambient techno']));

		// The picker shows them too
		await result.getByRole('link', { name: 'Review your favourite artists' }).click();
		await expect(page.getByTestId('taste-profile').getByTestId('taste-favourite')).toHaveCount(6);
		expect(pageErrors).toEqual([]);
	});

	test('importing again adds nothing new', async ({ page }) => {
		await importUser(page, 'solo_listener');
		await expect(page.getByTestId('lastfm-result')).toContainText('Imported 1 artist');
		await importUser(page, 'solo_listener');
		await expect(page.getByTestId('lastfm-result')).toContainText(
			'No new favourite artists from solo_listener (1 top artists checked).'
		);
		await expect(page.getByTestId('lastfm-result')).toContainText(
			'Skipped (already a favourite): Perihelion Drift'
		);
	});

	test('explains unknown users, rate limits, outages and bad usernames', async ({ page }) => {
		const error = page.getByTestId('lastfm-error');

		await importUser(page, 'nobody_here');
		await expect(error).toContainText('Last.fm does not know a user called "nobody_here"');

		await importUser(page, 'ratelimited');
		await expect(error).toContainText('Last.fm is limiting our requests right now');

		await importUser(page, 'broken');
		await expect(error).toContainText('Last.fm is not answering at the moment');

		await importUser(page, '9lives');
		await expect(error).toContainText('does not look like a Last.fm username');

		// Nothing was imported along the way
		const profile = await (await page.request.get('/api/taste/artists')).json();
		expect(profile.genres).toEqual(SEEDED_GENRES);
	});
});

test('the Last.fm import needs a login', async ({ page }) => {
	await page.goto('/');
	const response = await page.request.post('/api/taste/lastfm/import', {
		data: { username: 'fanatic' }
	});
	expect(response.status()).toBe(401);
});

test.describe('Spotify connect against the mock', () => {
	// Drives the OAuth callback the way Spotify would: the state is stored through /storestate
	// (what the connect buttons do) and the code picks the mock user (tests/mock-spotify.ts).
	async function completeSpotifyLogin(page: Page, code: string) {
		const key = `pw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const stored = await page.request.post('/storestate', {
			data: {
				key,
				state: JSON.stringify({ city: 'Berlin', formattedDate: '2031-06-21', source: 'user-home' })
			}
		});
		expect(stored.ok()).toBe(true);
		await page.goto(`/spotify/login?code=${code}&state=${key}`);
	}

	test('the connect buttons are shown by default (SPOTIFY_CONNECT_ENABLED unset)', async ({
		page
	}) => {
		await login(page, 'fan');
		await acceptCookies(page);
		await expect(page.getByTestId('spotify-connect')).toBeVisible();
		await expect(page.getByTestId('spotify-connect-off')).toHaveCount(0);
		await page.goto('/');
		await acceptCookies(page);
		await expect(page.getByTestId('spotify-connect')).toBeVisible();
		await expect(page.getByTestId('spotify-connect-off')).toHaveCount(0);
	});

	test('an account the development-mode app may not access gets a clear message', async ({
		page,
		pageErrors
	}) => {
		await login(page, 'fan');
		await completeSpotifyLogin(page, 'mock-code-unregistered');
		await expect(page).toHaveURL(/\/\?error=/);
		const flash = page.getByTestId('flash-error');
		await expect(flash).toContainText(
			'Spotify only lets a handful of registered accounts use this app right now, and yours is not one of them.'
		);
		await expect(flash).toContainText('taste profile');
		// No Spotify session was kept for the account
		expect((await page.request.get('/spotify')).status()).not.toBe(200);
		await flash.getByRole('button', { name: 'Dismiss message' }).click();
		await expect(flash).toHaveCount(0);
		expect(pageErrors).toEqual([]);
	});

	test('a registered account sees all three sections', async ({ page, pageErrors }) => {
		await login(page, 'newcomer');
		await completeSpotifyLogin(page, 'mock-code-ok');
		await expect(page).toHaveURL(/\/spotify$/);
		await expect(page.getByTestId('spotify-partial')).toHaveCount(0);
		await expect(page.getByTestId('spotify-not-registered')).toHaveCount(0);
		await expect(page.locator('.section.playlists .item')).toHaveCount(1);
		await expect(page.locator('.section.artists .item')).toHaveCount(3);
		await expect(page.locator('.section.tracks .item')).toHaveCount(1);
		expect(pageErrors).toEqual([]);
	});

	test('one failing Spotify call leaves the other sections on /spotify', async ({
		page,
		pageErrors
	}) => {
		await login(page, 'newcomer');
		await completeSpotifyLogin(page, 'mock-code-partial');
		await expect(page).toHaveURL(/\/spotify$/);
		const notice = page.getByTestId('spotify-partial');
		await expect(notice).toContainText('Some of your Spotify data could not be loaded');
		await expect(notice).toContainText('recently played tracks');
		await expect(notice).toContainText('HTTP 503');
		// The two calls that worked are shown, the failed one is simply empty
		await expect(page.locator('.section.artists .item')).toHaveCount(3);
		await expect(page.locator('.section.artists')).toContainText('Glass Anvil');
		await expect(page.locator('.section.playlists')).toContainText('Late Night Mock');
		await expect(page.locator('.section.tracks .item')).toHaveCount(0);
		expect(pageErrors).toEqual([]);
	});
});
