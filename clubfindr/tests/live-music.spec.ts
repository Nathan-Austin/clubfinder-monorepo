import { test, expect, mobileApi, bearer } from './fixtures';
import { registerVenue, removeVenue, type TestVenue } from './venue';
import { devQuery } from './db';

// Live music is an attribute of the night, not a genre (owner's decision 2026-11-17, ROADMAP
// section 5). A venue could only say it as a free-text event genre ("Live Music", "Acoustic"),
// which the cluster matcher cannot place — so it described the night to nobody, and since event
// genres are checked (KNOWN_ISSUES 91) it is refused outright. The attribute carries it instead,
// and customers filter on it: live music first, with the genres underneath.

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (offsetDays: number) =>
	new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

test('a venue marks a night as live music, and customers can filter on it', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let live: TestVenue | undefined;
	let dj: TestVenue | undefined;
	const date = isoDay(3);
	try {
		live = await registerVenue(api, 'live-band');
		dj = await registerVenue(api, 'dj-only');

		const band = await api.post(`/api/mobile/bars/${live.barId}/events`, {
			headers: bearer(live.token),
			data: {
				theme_name: 'Band night',
				event_date: date,
				live_music: true,
				special_genres: ['reggaeton']
			}
		});
		expect(band.status(), await band.text()).toBe(200);
		expect((await band.json()).event.live_music).toBe(true);

		const decks = await api.post(`/api/mobile/bars/${dj.barId}/events`, {
			headers: bearer(dj.token),
			data: { theme_name: 'DJ night', event_date: date, special_genres: ['reggaeton'] }
		});
		expect(decks.status(), await decks.text()).toBe(200);
		expect((await decks.json()).event.live_music).toBe(false);

		const matching = async (liveMusic: boolean) => {
			const response = await api.post('/api/mobile/bars/matching', {
				data: { city: 'Berlin', genres: ['reggaeton'], date, liveMusic }
			});
			expect(response.status(), await response.text()).toBe(200);
			return ((await response.json()) as { id: string }[]).map((bar) => bar.id);
		};

		// Without the filter both venues are there; with it, only the one with a band
		const all = await matching(false);
		expect(all).toContain(live.barId);
		expect(all).toContain(dj.barId);

		const onlyLive = await matching(true);
		expect(onlyLive).toContain(live.barId);
		expect(onlyLive, 'a DJ night is not live music').not.toContain(dj.barId);
	} finally {
		await removeVenue(live);
		await removeVenue(dj);
		await api.dispose();
	}
});

test('the attribute survives an edit, and is not a genre', async ({ playwright, baseURL }) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'live-edit');
		const auth = { headers: bearer(venue.token) };

		const created = await api.post(`/api/mobile/bars/${venue.barId}/events`, {
			...auth,
			data: { theme_name: 'Acoustic evening', event_date: isoDay(2), live_music: true }
		});
		expect(created.status(), await created.text()).toBe(200);
		const eventId = (await created.json()).event.id;

		// "Live Music" as a genre is still refused: that is what the attribute is for
		const asGenre = await api.put(`/api/mobile/bars/${venue.barId}/events/${eventId}`, {
			...auth,
			data: {
				theme_name: 'Acoustic evening',
				event_date: isoDay(2),
				live_music: true,
				special_genres: ['Live Music']
			}
		});
		expect(asGenre.status()).toBe(400);

		// Editing something else keeps the attribute
		const edited = await api.put(`/api/mobile/bars/${venue.barId}/events/${eventId}`, {
			...auth,
			data: { theme_name: 'Acoustic evening, early', event_date: isoDay(2), live_music: true }
		});
		expect(edited.status(), await edited.text()).toBe(200);
		const [stored] = await devQuery<{ live_music: boolean; theme_name: string }>(
			'SELECT live_music, theme_name FROM clubfindr.bar_events WHERE id = $1',
			[eventId]
		);
		expect(stored).toEqual({ live_music: true, theme_name: 'Acoustic evening, early' });

		// And it can be turned off
		const off = await api.put(`/api/mobile/bars/${venue.barId}/events/${eventId}`, {
			...auth,
			data: { theme_name: 'Acoustic evening, early', event_date: isoDay(2), live_music: false }
		});
		expect(off.status(), await off.text()).toBe(200);
		const [after] = await devQuery<{ live_music: boolean }>(
			'SELECT live_music FROM clubfindr.bar_events WHERE id = $1',
			[eventId]
		);
		expect(after.live_music).toBe(false);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});
