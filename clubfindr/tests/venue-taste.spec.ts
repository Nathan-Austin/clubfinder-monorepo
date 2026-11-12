import { test, expect, openBarDashboard, SPOTIFY_CONNECT_ENABLED } from './fixtures';
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
		await openBarDashboard(page);
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

	// ROADMAP section 1: matching used to score venues from bar_genre_profiles only, which
	// barfindr fills by polling venue Spotify — so what a venue says it plays changed nothing,
	// and a venue that never connected Spotify could not be matched at all.
	test('the artists a venue says it plays drive matching', async ({ page, context }) => {
		// Reggaeton is in the clusters but in no seeded venue's Spotify profile, and the mock
		// Spotify artist "Basement Omnivore" has it (tests/mock-spotify.ts)
		const search = { city: 'Berlin', genres: ['reggaeton'] };
		const lantern = async () => {
			const response = await page.request.post('/api/mobile/bars/matching', { data: search });
			expect(response.status(), await response.text()).toBe(200);
			const bars = (await response.json()) as {
				id: string;
				similarity: number;
				matchingGenres: string[];
				topGenres: string[];
			}[];
			const found = bars.find((bar) => bar.id === BAR_ID);
			expect(found, 'The Copper Lantern is among the Berlin venues').toBeDefined();
			return found!;
		};

		// The seeded venue artists already reach the profile: "minimal techno" comes from
		// Kasimir Low and is in no bar_genre_profiles row for this venue
		const before = await lantern();
		expect(before.topGenres, 'genres the venue itself declared').toContain('minimal techno');
		expect(before.similarity, 'nothing reggaeton about it yet').toBe(0);
		expect(before.matchingGenres).toEqual([]);

		const added = await page.request.post(`/api/venues/${BAR_ID}/taste/artists`, {
			data: { sourceId: 'devBasementOmnivore001' }
		});
		expect(added.status(), await added.text()).toBe(201);

		const after = await lantern();
		expect(after.similarity, 'now matches a reggaeton search').toBeGreaterThan(0);
		// Reported as the matcher was given it, which after group expansion is the cluster
		// data's own spelling ("Reggaeton")
		expect(after.matchingGenres.map((g) => g.toLowerCase())).toContain('reggaeton');

		// And on the web page, which scores venues the same way
		await context.addCookies(
			['city', 'date', 'selected-genres'].map((name, i) => ({
				name,
				value: ['Berlin', '2031-06-21', 'reggaeton'][i],
				url: new URL(page.url() || 'http://localhost').origin
			}))
		);
		await page.goto('/barfindr');
		await expect(page.locator('.club-value', { hasText: 'The Copper Lantern' })).toBeVisible();

		// Taking the artist away takes the match with it
		const artistId = (await added.json()).artist.id;
		expect(
			(await page.request.delete(`/api/venues/${BAR_ID}/taste/artists/${artistId}`)).ok()
		).toBe(true);
		expect((await lantern()).similarity, 'back to no reggaeton').toBe(0);
	});

	test('a venue cannot read or change another venue, and a bad id is a 400', async ({ page }) => {
		for (const path of ['/taste/artists', '/taste/search?q=juno', '/taste/genres']) {
			expect((await page.request.get(`/api/venues/${OTHER_BAR_ID}${path}`)).status()).toBe(403);
		}
		expect(
			(
				await page.request.post(`/api/venues/${OTHER_BAR_ID}/taste/artists`, {
					data: { sourceId: EXTRA.sourceId }
				})
			).status()
		).toBe(403);
		expect(
			(
				await page.request.put(`/api/venues/${OTHER_BAR_ID}/taste/genres`, {
					data: { genres: ['techno'] }
				})
			).status()
		).toBe(403);
		expect((await page.request.get('/api/venues/not-a-uuid/taste/artists')).status()).toBe(400);
		expect((await page.request.get('/api/venues/not-a-uuid/taste/genres')).status()).toBe(400);
	});
});

// The genres a venue declares outright (ROADMAP section 1): "we play techno", with no artist
// needed. The declared set joins the venue's artist genres in matching at the same weight.
test.describe('declared venue genres', () => {
	/** The seed declares none, so [] is the state these tests start from and put back. */
	async function resetDeclaredGenres(page: Page) {
		const response = await page.request.put(`/api/venues/${BAR_ID}/taste/genres`, {
			data: { genres: [] }
		});
		expect(response.status(), `reset declared genres: ${await response.text()}`).toBe(200);
	}

	test.beforeEach(async ({ page }) => {
		await openBarDashboard(page);
		await resetDeclaredGenres(page);
	});

	test.afterEach(async ({ page }) => {
		await resetDeclaredGenres(page);
	});

	test('stores a normalized set, refuses what no cluster knows, and reads it back', async ({
		page
	}) => {
		expect(
			(await (await page.request.get(`/api/venues/${BAR_ID}/taste/genres`)).json()).genres
		).toEqual([]);

		const saved = await page.request.put(`/api/venues/${BAR_ID}/taste/genres`, {
			data: { genres: ['Techno', ' deep  house ', 'techno'] }
		});
		expect(saved.status(), await saved.text()).toBe(200);
		expect((await saved.json()).genres).toEqual(['deep house', 'techno']);

		const read = await page.request.get(`/api/venues/${BAR_ID}/taste/genres`);
		expect((await read.json()).genres).toEqual(['deep house', 'techno']);

		// A genre no cluster knows is refused by name: declared genres exist to be matched
		const unknown = await page.request.put(`/api/venues/${BAR_ID}/taste/genres`, {
			data: { genres: ['techno', 'polka-metal-from-mars'] }
		});
		expect(unknown.status()).toBe(400);
		const refusal = await unknown.json();
		expect(refusal.message).toContain('polka-metal-from-mars');
		expect(refusal.genres).toEqual(['polka-metal-from-mars']);

		// And the stored set is untouched by the refused call
		expect(
			(await (await page.request.get(`/api/venues/${BAR_ID}/taste/genres`)).json()).genres
		).toEqual(['deep house', 'techno']);

		// Not an array, and too many, are refused too
		expect(
			(
				await page.request.put(`/api/venues/${BAR_ID}/taste/genres`, {
					data: { genres: 'techno' }
				})
			).status()
		).toBe(400);
		expect(
			(
				await page.request.put(`/api/venues/${BAR_ID}/taste/genres`, {
					data: { genres: Array.from({ length: 16 }, (_, i) => `genre ${i}`) }
				})
			).status()
		).toBe(400);
	});

	test('a declared genre drives matching with no artist behind it', async ({ page, context }) => {
		// Reggaeton is in the clusters but in no seeded profile of this venue (the artist-driven
		// test above adds and removes an artist for it; here no artist is involved at all)
		const search = { city: 'Berlin', genres: ['reggaeton'] };
		const lantern = async () => {
			const response = await page.request.post('/api/mobile/bars/matching', { data: search });
			expect(response.status(), await response.text()).toBe(200);
			const bars = (await response.json()) as {
				id: string;
				similarity: number;
				matchingGenres: string[];
			}[];
			const found = bars.find((bar) => bar.id === BAR_ID);
			expect(found, 'The Copper Lantern is among the Berlin venues').toBeDefined();
			return found!;
		};

		expect((await lantern()).similarity, 'nothing reggaeton about it yet').toBe(0);

		const declared = await page.request.put(`/api/venues/${BAR_ID}/taste/genres`, {
			data: { genres: ['reggaeton'] }
		});
		expect(declared.status(), await declared.text()).toBe(200);

		const after = await lantern();
		expect(after.similarity, 'now matches a reggaeton search').toBeGreaterThan(0);
		expect(after.matchingGenres.map((g) => g.toLowerCase())).toContain('reggaeton');

		// And on the web page, which scores venues the same way
		await context.addCookies(
			['city', 'date', 'selected-genres'].map((name, i) => ({
				name,
				value: ['Berlin', '2031-06-21', 'reggaeton'][i],
				url: new URL(page.url() || 'http://localhost').origin
			}))
		);
		await page.goto('/barfindr');
		await expect(page.locator('.club-value', { hasText: 'The Copper Lantern' })).toBeVisible();

		// Clearing the declaration takes the match with it
		await resetDeclaredGenres(page);
		expect((await lantern()).similarity, 'back to no reggaeton').toBe(0);
	});

	test('the dashboard section adds and removes a declared genre', async ({ page, pageErrors }) => {
		const section = page.getByTestId('venue-genres');
		await expect(section).toBeVisible();
		await expect(section.getByTestId('venue-genres-empty')).toBeVisible();

		await section.getByTestId('venue-genres-input').fill('Reggaeton');
		await section.getByTestId('venue-genres-add').click();
		await expect(section.getByTestId('venue-genres-list')).toContainText('reggaeton');

		// A genre no cluster knows shows the server's refusal and stores nothing
		await section.getByTestId('venue-genres-input').fill('polka-metal-from-mars');
		await section.getByTestId('venue-genres-add').click();
		await expect(section.getByTestId('venue-genres-error')).toContainText('polka-metal-from-mars');
		await expect(section.getByTestId('venue-genres-list')).not.toContainText(
			'polka-metal-from-mars'
		);

		await section.getByRole('button', { name: 'Remove reggaeton' }).click();
		await expect(section.getByTestId('venue-genres-empty')).toBeVisible();
		expect(pageErrors).toEqual([]);
	});
});

test('the venue taste endpoints need a venue login', async ({ page }) => {
	// No bar cookie and no bearer token; this context never logs in, so there is no cookie to
	// wait for and a 403 here cannot be the first-request race openBarDashboard guards against
	for (const path of ['/taste/artists', '/taste/search?q=juno', '/taste/genres']) {
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
		await openBarDashboard(page);
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
