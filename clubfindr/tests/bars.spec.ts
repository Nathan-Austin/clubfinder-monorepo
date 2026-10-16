import { test, expect, login, dismissSpotifyDialog } from './fixtures';

// Bar manager dashboard: BarDetailsModal and BarEventsSection/BarEventModal.
// Offline there is no Spotify session and no `barId` cookie, so saving is not possible;
// the tests cover opening, pre-filling, editing, validation feedback and closing.
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

	test('event modal: create form with custom genres, validation and cancel', async ({
		page,
		pageErrors
	}) => {
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

		// Saving needs a bar id, which only the Spotify flow provides: the modal stays open
		// and reports the failure instead of silently closing.
		await form.locator('button[type="submit"]').click();
		await expect(form.locator('.error-message').first()).toBeVisible();
		await expect(form).toBeVisible();

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
});
