import { test, expect, mobileApi, bearer } from './fixtures';
import { registerVenue, removeVenue, type TestVenue } from './venue';
import { devQuery } from './db';

// Recurring venue events are dates now (KNOWN_ISSUES 90). A recurring event is one row with a
// start date and a pattern; nothing expanded it, so a weekly night counted towards matching on
// its first date only and then disappeared from the venue's own list and from /barfindr, though
// it was still happening every week. $lib/events/recurrence is the one place that says which
// days a series falls on, and the venue list and both matchers read it.

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (offsetDays: number) =>
	new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

/** The venue registers in Berlin (tests/venue.ts), and reggaeton is in no seeded profile. */
const GENRE = 'reggaeton';

async function createEvent(
	api: Awaited<ReturnType<typeof mobileApi>>,
	venue: TestVenue,
	data: Record<string, unknown>
) {
	return api.post(`/api/mobile/bars/${venue.barId}/events`, {
		headers: bearer(venue.token),
		data: { theme_name: 'Weekly night', ...data }
	});
}

test('a weekly night is listed on every date, not just its first', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'recurring-list');
		const created = await createEvent(api, venue, {
			event_date: isoDay(-14), // started a fortnight ago
			recurring: true,
			recurrence_pattern: 'weekly',
			special_genres: [GENRE]
		});
		expect(created.status(), await created.text()).toBe(200);

		// A one-off in the past stays gone
		expect(
			(
				await createEvent(api, venue, { theme_name: 'Last month', event_date: isoDay(-10) })
			).status()
		).toBe(200);

		const listed = await api.get(`/api/mobile/bars/${venue.barId}/events`, {
			headers: bearer(venue.token)
		});
		expect(listed.status(), await listed.text()).toBe(200);
		const events = (await listed.json()).events as {
			id: string;
			occurrence_id: string;
			event_date: string;
			theme_name: string;
		}[];

		const weekly = events.filter((event) => event.theme_name === 'Weekly night');
		expect(weekly.length, 'several dates of the one series').toBeGreaterThan(1);
		expect(new Set(weekly.map((event) => event.id)).size, 'all the same row').toBe(1);
		expect(
			new Set(weekly.map((event) => event.occurrence_id)).size,
			'each date has its own key'
		).toBe(weekly.length);
		for (const event of weekly) {
			expect(event.event_date >= isoDay(0), `${event.event_date} is upcoming`).toBe(true);
			// Every date is the series' weekday
			expect((Date.parse(event.event_date) - Date.parse(isoDay(-14))) % (7 * DAY_MS)).toBe(0);
		}
		expect(events.some((event) => event.theme_name === 'Last month')).toBe(false);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});

test('a weekly night counts for matching on its later dates too', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'recurring-match');
		const created = await createEvent(api, venue, {
			event_date: isoDay(-7),
			recurring: true,
			recurrence_pattern: 'weekly',
			special_genres: [GENRE]
		});
		expect(created.status(), await created.text()).toBe(200);

		const matchOn = async (date: string) => {
			const response = await api.post('/api/mobile/bars/matching', {
				data: { city: 'Berlin', genres: [GENRE], date }
			});
			expect(response.status(), await response.text()).toBe(200);
			const bars = (await response.json()) as { id: string; similarity: number }[];
			return bars.find((bar) => bar.id === venue!.barId);
		};

		// Three weeks after the start: a date of the series, so the night describes the venue
		const onSeriesDate = await matchOn(isoDay(14));
		expect(onSeriesDate, 'the venue is among the Berlin venues').toBeDefined();
		expect(onSeriesDate!.similarity, 'the weekly night counts on this date').toBeGreaterThan(0);

		// The day after is not one of its dates
		const offSeriesDate = await matchOn(isoDay(15));
		expect(offSeriesDate!.similarity, 'nothing on this night').toBe(0);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});

test('a repeating event must say how it repeats', async ({ playwright, baseURL }) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'recurring-pattern');

		const refused = await createEvent(api, venue, {
			event_date: isoDay(1),
			recurring: true,
			recurrence_pattern: 'every full moon'
		});
		expect(refused.status()).toBe(400);
		expect((await refused.json()).validationErrors.join(' ')).toContain('daily, weekly');

		const missing = await createEvent(api, venue, { event_date: isoDay(1), recurring: true });
		expect(missing.status()).toBe(400);

		// The four the forms offer are kept, however they are written
		const accepted = await createEvent(api, venue, {
			event_date: isoDay(1),
			recurring: true,
			recurrence_pattern: 'Bi-weekly'
		});
		expect(accepted.status(), await accepted.text()).toBe(200);
		const [stored] = await devQuery<{ recurrence_pattern: string }>(
			'SELECT recurrence_pattern FROM clubfindr.bar_events WHERE bar_id = $1',
			[venue.barId]
		);
		expect(stored.recurrence_pattern, 'stored as the matcher reads it').toBe('biweekly');
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});
