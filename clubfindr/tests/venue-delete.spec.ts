import { test, expect, mobileApi, bearer, acceptCookies } from './fixtures';
import { registerVenue, removeVenue, type TestVenue } from './venue';
import { devQuery } from './db';

// Deleting a venue account ($lib/server/deleteVenue; ROADMAP "From the 2026-11-18 device run"):
// Google Play's account-deletion policy covers venue accounts, so the app's Venue tab
// (DELETE /api/mobile/bars/:barId) and the web dashboard's "Delete this venue" section
// (DELETE /api/bars/:barId) both remove the venue and everything it owns, in one transaction.
//
// Each test registers a venue of its own (tests/venue.ts, KNOWN_ISSUES 59); removeVenue in the
// finally is a no-op for what the test already deleted, and still removes the venue's personal
// account, which deletion keeps on purpose.

test('only the venue itself may delete it', async ({ playwright, baseURL }) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	let other: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'delete-guard');
		other = await registerVenue(api, 'delete-other');

		const withoutToken = await api.delete(`/api/mobile/bars/${venue.barId}`);
		expect(withoutToken.status(), 'without a token').toBe(403);

		const wrongToken = await api.delete(`/api/mobile/bars/${venue.barId}`, {
			headers: bearer(other.token)
		});
		expect(wrongToken.status(), 'with another venue’s token').toBe(403);

		const webWithoutSession = await api.delete(`/api/bars/${venue.barId}`);
		expect(webWithoutSession.status(), 'web route without a session').toBe(403);

		const stillThere = await devQuery('SELECT 1 FROM clubfindr.bars WHERE id = $1', [venue.barId]);
		expect(stillThere.length).toBe(1);
	} finally {
		await removeVenue(venue);
		await removeVenue(other);
		await api.dispose();
	}
});

test('deleting the venue removes everything it owns and ends its sessions', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'delete-own');

		// Give the venue things to own: an event and a QR code
		const event = await api.post(`/api/mobile/bars/${venue.barId}/events`, {
			headers: bearer(venue.token),
			data: { theme_name: 'Farewell night', event_date: '2031-06-22' }
		});
		expect(event.status(), await event.text()).toBe(200);
		const qr = await api.post(`/api/mobile/bars/${venue.barId}/qrcodes`, {
			headers: bearer(venue.token),
			data: { title: 'Door code', type: 'entrance' }
		});
		expect(qr.status(), await qr.text()).toBe(200);

		const deleted = await api.delete(`/api/mobile/bars/${venue.barId}`, {
			headers: bearer(venue.token)
		});
		expect(deleted.status(), await deleted.text()).toBe(200);

		// The venue, its rows and its sessions are gone
		for (const [table, column] of [
			['bars', 'id'],
			['bar_events', 'bar_id'],
			['bar_qr_codes', 'bar_id'],
			['bar_sessions', 'bar_id']
		]) {
			const rows = await devQuery(`SELECT 1 FROM clubfindr.${table} WHERE ${column} = $1`, [
				venue.barId
			]);
			expect(rows.length, `${table} rows left behind`).toBe(0);
		}

		// The old token no longer opens anything
		const afterwards = await api.patch(`/api/mobile/bars/${venue.barId}`, {
			headers: bearer(venue.token),
			data: { description: 'x' }
		});
		expect(afterwards.status()).toBe(403);

		// The venue login is gone; the personal account it registered stays
		const login = await api.post('/api/mobile/bars/login', {
			data: { email: venue.email, password: venue.password }
		});
		expect(login.status()).not.toBe(200);
		const personal = await devQuery('SELECT 1 FROM clubfindr.users WHERE general_email = $1', [
			venue.email
		]);
		expect(personal.length, 'the personal account must stay').toBe(1);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});

test('the web dashboard deletes the venue after its name is typed', async ({
	page,
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'delete-web');
		const named = await devQuery('SELECT name FROM clubfindr.bars WHERE id = $1', [venue.barId]);
		const venueName = String(named[0].name);

		await page.goto('/login/bars');
		await acceptCookies(page);
		const form = page.locator('form').first();
		await form.locator('input[type="email"]').fill(venue.email);
		await form.locator('input[type="password"]').fill(venue.password);
		await form.locator('button[type="submit"]').click();
		await page.waitForURL('**/bars');

		await page.getByTestId('delete-venue-open').click();
		const confirm = page.getByTestId('delete-venue-confirm');
		await expect(confirm, 'disarmed until the name matches').toBeDisabled();
		await page.getByTestId('delete-venue-name').fill(venueName);
		await expect(confirm).toBeEnabled();
		await confirm.click();

		await page.waitForURL((url) => url.pathname === '/');
		const gone = await devQuery('SELECT 1 FROM clubfindr.bars WHERE id = $1', [venue.barId]);
		expect(gone.length).toBe(0);

		// The venue session cookie went with the venue: the dashboard is closed now
		await page.goto('/bars');
		await page.waitForURL('**/login/bars');
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});
