import { test, expect, mobileApi, bearer } from './fixtures';
import { registerVenue, removeVenue, type TestVenue } from './venue';
import { devQuery } from './db';
import suggestions from '../static/lib/genre-suggestions.json' with { type: 'json' };

// Strict event genres (KNOWN_ISSUES 91). A venue's event used to take any free text as its
// genres, so a typo or an invented genre sat on the night doing nothing: the matcher cannot
// place it, and the night reaches nobody. The event form suggests exactly what the server
// accepts now, so a refusal names a real mistake.

const EVENT = { theme_name: 'Genre night', event_date: '2031-07-04' };

test('an event takes the genres the pickers suggest, and refuses the rest', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'event-genres');
		const auth = { headers: bearer(venue.token) };

		// "House" is a suggestion the old list did not even offer (2026-11-18 run)
		expect(suggestions.genres).toContain('House');
		const created = await api.post(`/api/mobile/bars/${venue.barId}/events`, {
			...auth,
			data: { ...EVENT, special_genres: ['House', '  TECHNO  ', 'house'] }
		});
		expect(created.status(), await created.text()).toBe(200);
		const eventId = (await created.json()).event.id;

		// Stored normalised and de-duplicated
		const [stored] = await devQuery<{ special_genres: string[] }>(
			'SELECT special_genres FROM clubfindr.bar_events WHERE id = $1',
			[eventId]
		);
		expect(stored.special_genres).toEqual(['house', 'techno']);

		// An invented genre is refused, by name, and changes nothing
		const refused = await api.put(`/api/mobile/bars/${venue.barId}/events/${eventId}`, {
			...auth,
			data: { ...EVENT, special_genres: ['techno', 'polka-step'] }
		});
		expect(refused.status()).toBe(400);
		expect((await refused.json()).validationErrors.join(' ')).toContain(
			'Not genres Clubfindr knows: polka-step'
		);
		const [unchanged] = await devQuery<{ special_genres: string[] }>(
			'SELECT special_genres FROM clubfindr.bar_events WHERE id = $1',
			[eventId]
		);
		expect(unchanged.special_genres).toEqual(['house', 'techno']);

		// Creating with an invented genre is refused too
		const refusedCreate = await api.post(`/api/mobile/bars/${venue.barId}/events`, {
			...auth,
			data: { ...EVENT, special_genres: ['nonsensecore'] }
		});
		expect(refusedCreate.status()).toBe(400);

		// An event may still have no genres at all
		const bare = await api.post(`/api/mobile/bars/${venue.barId}/events`, {
			...auth,
			data: { ...EVENT, theme_name: 'Quiet night' }
		});
		expect(bare.status(), await bare.text()).toBe(200);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});

test('every suggestion the pickers offer is accepted on an event', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	let venue: TestVenue | undefined;
	try {
		venue = await registerVenue(api, 'event-genre-sample');
		const auth = { headers: bearer(venue.token) };

		// A spread through the list rather than all 1,238: the per-entry contract is a unit test
		// (src/lib/taste/genreSuggestions.test.ts); this checks the endpoint agrees with it
		const sample = suggestions.genres.filter((_, index) => index % 150 === 0);
		expect(sample.length).toBeGreaterThan(5);
		const created = await api.post(`/api/mobile/bars/${venue.barId}/events`, {
			...auth,
			data: { ...EVENT, special_genres: sample.slice(0, 15) }
		});
		expect(created.status(), `a sample of suggestions: ${sample.slice(0, 15).join(', ')}`).toBe(
			200
		);
	} finally {
		await removeVenue(venue);
		await api.dispose();
	}
});
