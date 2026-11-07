import { test, expect, login, dismissSpotifyDialog, SPOTIFY_CONNECT_ENABLED } from './fixtures';
import type { Page } from './fixtures';

// The artists a venue says it plays (ROADMAP section 1, KNOWN_ISSUES 4): the shared
// ArtistPicker on the bar dashboard, against /api/venues/:barId/taste.
//
// The seeded bar "The Copper Lantern" starts with two artists (dev/seed.sql). These tests log
// in as the `bar` user and change its profile, so they run in order in one file and put the
// seed back; no other spec logs in as `bar` except tests/bars.spec.ts, which does not touch
// the taste endpoints.
test.describe.configure({ mode: 'default' });

const BAR_ID = '00000000-0000-4000-8000-0000000000b1';
const OTHER_BAR_ID = '00000000-0000-4000-8000-0000000000b2';
const SEEDED_ARTISTS = ['Juno Paperplane', 'Kasimir Low'];
const SEEDED_GENRES = ['deep house', 'dub techno', 'minimal', 'minimal techno'];
/** Only in the mock Spotify catalogue (tests/mock-spotify.ts) */
const EXTRA = { sourceId: 'devVelvetMeridian00001', name: 'Velvet Meridian', query: 'velvet' };

/**
 * Logs in as the bar manager and waits until the dashboard's own picker request has come
 * back. `login()` resolves as soon as the URL is /bars, and the very first page.request call
 * made that early can go out before the API context has picked up the session cookie (it then
 * answers 403, and the next identical call succeeds). Waiting for the picker to render its
 * loaded state is a real readiness signal, and keeps every assertion below exact.
 */
async function openDashboard(page: Page) {
	await login(page, 'bar');
	await expect(
		page
			.locator(
				'[data-testid="venue-artists"] [data-testid="taste-favourite"], [data-testid="venue-artists"] [data-testid="taste-empty"]'
			)
			.first()
	).toBeVisible();
}

/** Removes anything the tests added, so the file can be re-run against the same database. */
async function resetVenueArtists(page: Page) {
	const response = await page.request.get(`/api/venues/${BAR_ID}/taste/artists`);
	expect(response.status(), `GET venue artists: ${await response.text()}`).toBe(200);
	const profile = await response.json();
	for (const artist of profile.artists as { id: string; name: string }[]) {
		if (!SEEDED_ARTISTS.includes(artist.name)) {
			expect(
				(await page.request.delete(`/api/venues/${BAR_ID}/taste/artists/${artist.id}`)).ok()
			).toBe(true);
		}
	}
}

test.describe('venue taste API', () => {
	test.beforeEach(async ({ page }) => {
		await openDashboard(page);
		await resetVenueArtists(page);
	});

	test.afterEach(async ({ page }) => {
		await resetVenueArtists(page);
	});

	test('lists the venue artists and the genres they imply', async ({ page }) => {
		const response = await page.request.get(`/api/venues/${BAR_ID}/taste/artists`);
		expect(response.status()).toBe(200);
		const profile = await response.json();
		expect(profile.artists.map((a: { name: string }) => a.name)).toEqual(SEEDED_ARTISTS);
		expect(profile.genres).toEqual(SEEDED_GENRES);
	});

	test('adds and removes an artist, and the genres follow', async ({ page }) => {
		const added = await page.request.post(`/api/venues/${BAR_ID}/taste/artists`, {
			data: { sourceId: EXTRA.sourceId }
		});
		expect(added.status()).toBe(201);
		const body = await added.json();
		expect(body.artist.name).toBe(EXTRA.name);
		expect(body.genres).toContain('italo disco');

		// Adding the same artist again is not an error and creates nothing
		const again = await page.request.post(`/api/venues/${BAR_ID}/taste/artists`, {
			data: { sourceId: EXTRA.sourceId }
		});
		expect(again.status()).toBe(200);
		expect((await again.json()).created).toBe(false);

		const removed = await page.request.delete(
			`/api/venues/${BAR_ID}/taste/artists/${body.artist.id}`
		);
		expect(removed.status()).toBe(200);
		expect((await removed.json()).genres).toEqual(SEEDED_GENRES);
	});

	test('search combines the catalogue with the mock Spotify and flags what is already in', async ({
		page
	}) => {
		const response = await page.request.get(`/api/venues/${BAR_ID}/taste/search?q=juno`);
		expect(response.status()).toBe(200);
		const { artists } = await response.json();
		const juno = artists.find((a: { name: string }) => a.name === 'Juno Paperplane');
		expect(juno, 'the seeded artist is a hit').toBeDefined();
		expect(juno.favourite, 'already one of the venue artists').toBe(true);

		// A query that is too short is refused before anything is looked up
		expect((await page.request.get(`/api/venues/${BAR_ID}/taste/search?q=a`)).status()).toBe(400);
	});

	test('a venue cannot read or change another venue, and a bad id is a 400', async ({ page }) => {
		for (const path of ['/taste/artists', '/taste/search?q=juno']) {
			expect((await page.request.get(`/api/venues/${OTHER_BAR_ID}${path}`)).status()).toBe(403);
		}
		expect(
			(
				await page.request.post(`/api/venues/${OTHER_BAR_ID}/taste/artists`, {
					data: { sourceId: EXTRA.sourceId }
				})
			).status()
		).toBe(403);
		expect((await page.request.get('/api/venues/not-a-uuid/taste/artists')).status()).toBe(400);
	});
});

test('the venue taste endpoints need a venue login', async ({ page }) => {
	// No bar cookie and no bearer token; this context never logs in, so there is no cookie to
	// wait for and a 403 here cannot be the first-request race openDashboard guards against
	for (const path of ['/taste/artists', '/taste/search?q=juno']) {
		expect((await page.request.get(`/api/venues/${BAR_ID}${path}`)).status()).toBe(403);
	}
});

test('a mobile bar session token works in place of the dashboard cookie', async ({ page }) => {
	const loggedIn = await page.request.post('/api/mobile/bars/login', {
		data: { email: 'bar@clubfindr.test', password: 'BarManager#2026' }
	});
	expect(loggedIn.status()).toBe(200);
	const { token, barData } = await loggedIn.json();
	expect(barData.id).toBe(BAR_ID);

	// A fresh context would carry no cookies anyway; the header is what authorises here
	const response = await page.request.get(`/api/venues/${BAR_ID}/taste/artists`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	expect(response.status()).toBe(200);
	expect((await response.json()).artists.map((a: { name: string }) => a.name)).toEqual(
		SEEDED_ARTISTS
	);

	// The same token is no good for another venue
	expect(
		(
			await page.request.get(`/api/venues/${OTHER_BAR_ID}/taste/artists`, {
				headers: { Authorization: `Bearer ${token}` }
			})
		).status()
	).toBe(403);
});

test.describe('venue artists on the dashboard', () => {
	test.beforeEach(async ({ page }) => {
		await openDashboard(page);
		await dismissSpotifyDialog(page);
		await resetVenueArtists(page);
	});

	test.afterEach(async ({ page }) => {
		await resetVenueArtists(page);
	});

	test('shows the seeded artists and their genres, and adds one through the picker', async ({
		page,
		pageErrors
	}) => {
		const section = page.getByTestId('venue-artists');
		await expect(section).toBeVisible();
		await expect(section.getByTestId('venue-artists-no-id')).toHaveCount(0);
		await expect(section.getByTestId('taste-favourite')).toHaveText([
			/Juno Paperplane/,
			/Kasimir Low/
		]);
		await expect(section.getByTestId('taste-genre')).toHaveText(SEEDED_GENRES);
		await expect(section.getByTestId('venue-artists-summary')).toContainText('2 artists');

		await section.getByTestId('taste-search').fill(EXTRA.query);
		await section.getByRole('button', { name: `Add ${EXTRA.name}` }).click();
		await expect(section.getByTestId('taste-favourite')).toHaveCount(3);
		await expect(section.getByTestId('taste-genre')).toContainText(['italo disco']);
		await expect(section.getByTestId('venue-artists-summary')).toContainText('3 artists');

		// And removing it again puts the profile back
		await section.getByRole('button', { name: `Remove ${EXTRA.name}` }).click();
		await expect(section.getByTestId('taste-favourite')).toHaveCount(2);
		expect(pageErrors).toEqual([]);
	});

	test('the dashboard shows the events section whether or not Spotify is connected', async ({
		page
	}) => {
		// KNOWN_ISSUES 4: offline there is no Spotify session, but the venue still manages
		// its events and artists
		await expect(page.locator('.add-event-button')).toBeVisible();
		await expect(page.getByTestId('venue-artists')).toBeVisible();

		if (SPOTIFY_CONNECT_ENABLED) {
			// The reconnect offer is still there while the flag is on
			await expect(page.locator('.spotify-reconnect-btn')).toBeVisible();
		} else {
			await expect(page.locator('.spotify-reconnect-btn')).toHaveCount(0);
			await expect(page.locator('.spotify-logo')).toHaveCount(0);
		}
	});
});
