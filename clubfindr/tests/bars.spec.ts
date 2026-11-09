import { test, expect, openBarDashboard } from './fixtures';

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
		await openBarDashboard(page);
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

	// KNOWN_ISSUES 17: node-pg parsed event_date into a Date at the server's local midnight, so
	// it reached the browser as the previous day's 22:00Z and the modal's
	// `new Date(...).toISOString()` saved that previous day. Editing anything else about an
	// event silently moved it a day earlier, and again on every further edit.
	test('editing an event keeps its date (KNOWN_ISSUES 17)', async ({ page, pageErrors }) => {
		const theme = `Date Keeper ${Date.now()}`;
		const EVENT_DATE = '2031-06-21';
		const section = page.locator('section', { has: page.locator('.add-event-button') });

		// Create one to edit
		await page.locator('.add-event-button').click();
		const createForm = page.locator('#event-details-form');
		await createForm.locator('#themeName').fill(theme);
		await createForm.locator('#eventDate').fill(EVENT_DATE);
		await createForm.locator('#startTime').fill('22:00');
		await createForm.locator('button[type="submit"]').click();
		await expect(createForm).toHaveCount(0);

		const listed = await (await page.request.get(`/api/bars/${BAR_ID}/events`)).json();
		const created = (
			listed.events as { id: string; theme_name: string; event_date: string }[]
		).find((e) => e.theme_name === theme);
		expect(created, 'the created event').toBeDefined();
		// Stored and sent on as a plain calendar date, not a timestamp a day behind
		expect(created!.event_date, 'event_date as the API returns it').toBe(EVENT_DATE);

		// Reopen it: the date input is pre-filled with the stored day
		await section
			.locator('.event-card', { has: page.locator('h3', { hasText: theme }) })
			.locator('.edit-button')
			.click();
		const editForm = page.locator('#event-details-form');
		await expect(editForm.locator('#eventDate')).toHaveValue(EVENT_DATE);

		// Change only the name and save
		await editForm.locator('#themeName').fill(`${theme} (edited)`);
		const saved = page.waitForResponse(
			(r) => r.request().method() === 'PUT' && r.url().includes(`/api/bars/${BAR_ID}/events/`)
		);
		await editForm.locator('button[type="submit"]').click();
		expect((await saved).status(), 'PUT /api/bars/:barId/events/:eventId').toBe(200);
		await expect(editForm).toHaveCount(0);

		// The date is untouched after the round trip
		const after = await (await page.request.get(`/api/bars/${BAR_ID}/events`)).json();
		const edited = (after.events as { id: string; event_date: string }[]).find(
			(e) => e.id === created!.id
		);
		expect(edited!.event_date, 'event_date after editing the name').toBe(EVENT_DATE);

		expect((await page.request.delete(`/api/bars/${BAR_ID}/events/${created!.id}`)).ok()).toBe(
			true
		);
		expect(pageErrors).toEqual([]);
	});
});
