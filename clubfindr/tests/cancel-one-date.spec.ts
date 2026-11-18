import { test, expect, mobileApi, bearer } from './fixtures';
import { registerVenue, removeVenue, type TestVenue } from './venue';
import { devQuery } from './db';

// Cancelling one date of a recurring event (KNOWN_ISSUES 89). A recurring event is one row
// expanded into dates (KNOWN_ISSUES 90), so a venue closing on one of those nights could only
// delete the series and lose every other date. A cancelled date is a bar_event_skips row, which
// the occurrence function leaves out: the night goes from the venue's list and from matching,
// and the series goes on.

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (offsetDays: number) =>
	new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

test('a venue cancels one date and keeps the rest of the series', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'cancel-date');
		const auth = { headers: bearer(venue.token) };
		const start = isoDay(0);

		const created = await api.post(`/api/mobile/bars/${venue.barId}/events`, {
			...auth,
			data: {
				theme_name: 'Weekly night',
				event_date: start,
				recurring: true,
				recurrence_pattern: 'weekly',
				special_genres: ['reggaeton']
			}
		});
		expect(created.status(), await created.text()).toBe(200);
		const eventId = (await created.json()).event.id;

		const dates = async () => {
			const response = await api.get(`/api/mobile/bars/${venue!.barId}/events`, auth);
			expect(response.status(), await response.text()).toBe(200);
			return ((await response.json()).events as { event_date: string }[]).map(
				(event) => event.event_date
			);
		};

		const before = await dates();
		expect(before.length, 'several dates of the series').toBeGreaterThan(2);
		const toCancel = before[1];

		const cancelled = await api.delete(
			`/api/mobile/bars/${venue.barId}/events/${eventId}?date=${toCancel}`,
			auth
		);
		expect(cancelled.status(), await cancelled.text()).toBe(200);
		expect((await cancelled.json()).cancelledDate).toBe(toCancel);

		const after = await dates();
		expect(after, 'the cancelled night is gone').not.toContain(toCancel);
		for (const date of before.filter((d) => d !== toCancel)) {
			expect(after, `${date} stays`).toContain(date);
		}
		// The cap is per series, so cancelling a date frees a slot and the list reaches one
		// night further ahead
		expect(after.length).toBe(before.length);

		// The row is still there: the series goes on
		const [row] = await devQuery<{ id: string }>(
			'SELECT id FROM clubfindr.bar_events WHERE id = $1',
			[eventId]
		);
		expect(row).toBeDefined();

		// Matching agrees: nothing on that night, the next one still counts
		const matchOn = async (date: string) => {
			const response = await api.post('/api/mobile/bars/matching', {
				data: { city: 'Berlin', genres: ['reggaeton'], date }
			});
			const bars = (await response.json()) as { id: string; similarity: number }[];
			return bars.find((bar) => bar.id === venue!.barId)?.similarity ?? 0;
		};
		expect(await matchOn(toCancel), 'the cancelled night').toBe(0);
		expect(await matchOn(after[1]), 'the next night still counts').toBeGreaterThan(0);

		// Cancelling the same date twice is harmless
		const again = await api.delete(
			`/api/mobile/bars/${venue.barId}/events/${eventId}?date=${toCancel}`,
			auth
		);
		expect(again.status()).toBe(200);
		expect(await dates()).toEqual(after);

		// A malformed date is refused rather than deleting the series
		const bad = await api.delete(
			`/api/mobile/bars/${venue.barId}/events/${eventId}?date=next%20friday`,
			auth
		);
		expect(bad.status()).toBe(400);
		expect((await dates()).length).toBe(after.length);

		// Without a date the whole series goes, as before
		const deleted = await api.delete(`/api/mobile/bars/${venue.barId}/events/${eventId}`, auth);
		expect(deleted.status(), await deleted.text()).toBe(200);
		expect(await dates()).toEqual([]);
		const skipsLeft = await devQuery(
			'SELECT 1 FROM clubfindr.bar_event_skips WHERE event_id = $1',
			[eventId]
		);
		expect(skipsLeft.length, 'the skips go with the event').toBe(0);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});
