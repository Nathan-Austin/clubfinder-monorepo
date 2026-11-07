import { test, expect, login, dismissSpotifyDialog } from './fixtures';

// Bar manager dashboard: BarDetailsModal and BarEventsSection/BarEventModal.
// Offline there is no Spotify session, but the dashboard still knows its `barId`
// (KNOWN_ISSUES 4), so events can be managed here without connecting Spotify.
//
// Creating an event writes a row for the seeded bar, so that test cleans up after itself and
// this file runs its tests in order: a parallel test must not see the half-created event.
test.describe.configure({ mode: 'default' });

/** The seeded bar manager's venue, "The Copper Lantern" (dev/seed.sql). */
const BAR_ID = '00000000-0000-4000-8000-0000000000b1';

test.describe('bar dashboard modals', () => {
	test.beforeEach(async ({ page }) => {
		await login(page, 'bar');
		await dismissSpotifyDialog(page);
	});

	test('bar details modal is pre-filled and can be edited and cancelled', async ({
		page,
		pageErrors
	}) => {
		await page.locator('.bar-details-btn').click();
		const form = page.locator('#bar-details-form');
		await expect(form).toBeVisible();
		await expect(form.locator('#barName')).toHaveValue('The Copper Lantern');

		await form.locator('#barName').fill('The Copper Lantern (edited)');
		// bar types are chips (the checkbox itself is hidden), max 3
		const chips = form.locator('label.bar-type-chip');
		await chips.nth(0).click();
		await chips.nth(1).click();
		await expect(form.locator('label.bar-type-chip.selected')).toHaveCount(2);

		await form.locator('button', { hasText: 'Cancel' }).click();
		await expect(form).toHaveCount(0);
		// The heading still shows the saved name
		await expect(page.locator('h1').first()).toContainText("The Copper Lantern's");
		expect(pageErrors).toEqual([]);
	});

	test('event modal: create form with custom genres and cancel', async ({ page, pageErrors }) => {
		const section = page.locator('section', { has: page.locator('.add-event-button') });
		await section.locator('.add-event-button').click();
		const form = page.locator('#event-details-form');
		await expect(form).toBeVisible();
		await expect(page.locator('.modal h2, .modal-content h2').first()).toContainText(
			/Create New Event|Special Events/
		);

		await form.locator('#themeName').fill('Smoke Test Night');
		await form.locator('#eventDate').fill('2030-01-15');
		await form.locator('#startTime').fill('21:00');

		// preset genre checkbox + custom genre chip
		await form.locator('label.genre-tag', { hasText: 'Jazz' }).locator('input').check();
		await form.locator('#customGenre').fill('smoketest');
		await form.locator('.add-genre-button').click();
		await expect(form.locator('.selected-genre', { hasText: 'smoketest' })).toBeVisible();
		await form.locator('.selected-genre', { hasText: 'smoketest' }).locator('button').click();
		await expect(form.locator('.selected-genre', { hasText: 'smoketest' })).toHaveCount(0);

		// recurring toggle reveals the pattern select
		await form.locator('label.checkbox-label input[type="checkbox"]').check();
		await expect(form.locator('#recurrencePattern')).toBeVisible();

		await form.locator('button', { hasText: 'Cancel' }).click();
		await expect(form).toHaveCount(0);
		expect(pageErrors).toEqual([]);
	});

	test('event modal: the close button closes it', async ({ page }) => {
		await page.locator('.add-event-button').click();
		await expect(page.locator('#event-details-form')).toBeVisible();
		await page.locator('.close-button').click();
		await expect(page.locator('#event-details-form')).toHaveCount(0);
	});

	// KNOWN_ISSUES 4: the dashboard used to get no barId without the Spotify flow, so the
	// modal posted to /api/bars//events and answered 404. Offline there is still no Spotify
	// session, so this passing is the fix.
	test('an event can be created with no Spotify session (KNOWN_ISSUES 4)', async ({
		page,
		pageErrors
	}) => {
		const theme = `Decoupled Night ${Date.now()}`;

		await page.locator('.add-event-button').click();
		const form = page.locator('#event-details-form');
		await form.locator('#themeName').fill(theme);
		await form.locator('#eventDate').fill('2031-06-21');
		await form.locator('#startTime').fill('22:00');

		const posted = page.waitForResponse(
			(r) => r.request().method() === 'POST' && r.url().includes(`/api/bars/${BAR_ID}/events`)
		);
		await form.locator('button[type="submit"]').click();
		expect((await posted).status(), 'POST /api/bars/:barId/events').toBe(200);

		// The modal reports success, then closes, and the event is in the list
		await expect(form.locator('.success-message').first()).toBeVisible();
		await expect(form).toHaveCount(0);
		const section = page.locator('section', { has: page.locator('.add-event-button') });
		await expect(section.locator('.event-card h3', { hasText: theme })).toBeVisible();

		// Clean up, so a re-run against the same database starts from the seed again
		const created = await (await page.request.get(`/api/bars/${BAR_ID}/events`)).json();
		const mine = (created.events as { id: string; theme_name: string }[]).find(
			(e) => e.theme_name === theme
		);
		expect(mine, 'the created event').toBeDefined();
		expect((await page.request.delete(`/api/bars/${BAR_ID}/events/${mine!.id}`)).ok()).toBe(true);
		expect(pageErrors).toEqual([]);
	});
});
