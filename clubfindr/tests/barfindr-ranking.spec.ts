import { test, expect } from './fixtures';
import { devQuery } from './db';
import { toLocalIsoDate } from '../src/lib/localDate';

// /barfindr took the first 50 venues of a city in alphabetical order and only then scored them,
// so in a city with more than 50 venues one whose name sorts late could never be shown, however
// well it matched. It surfaced on 2026-11-12: a day of e2e runs without a reseed left 52
// throwaway Berlin venues, and the seeded "The Copper Lantern" fell to 51st.
//
// This builds its own city — 50 venues that sort first and match nothing, then one late,
// matching venue — so it holds on a fresh database too, and touches no other test's data.

const CITY = `rankville-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const LATE_MATCH = 'Zz Late Match';

test.beforeAll(async () => {
	await devQuery(
		`INSERT INTO clubfindr.bars (name, contact_person, general_email, city)
		 SELECT 'Aaa Filler ' || lpad(n::text, 2, '0'), 'Ranking Test',
		        $1 || '-filler-' || n || '@clubfindr.test', $1
		   FROM generate_series(1, 50) AS n`,
		[CITY]
	);
	const [late] = await devQuery<{ id: string }>(
		`INSERT INTO clubfindr.bars (name, contact_person, general_email, city)
		 VALUES ($1, 'Ranking Test', $2 || '-late@clubfindr.test', $2) RETURNING id`,
		[LATE_MATCH, CITY]
	);
	await devQuery(
		`INSERT INTO clubfindr.bar_genre_profiles (bar_id, current_genres, rolling_genre_profile)
		 VALUES ($1, '["techno"]', '{"techno": 1}')`,
		[late.id]
	);
});

test.afterAll(async () => {
	// bar_genre_profiles cascades
	await devQuery('DELETE FROM clubfindr.bars WHERE city = $1', [CITY]);
});

test('a matching venue is found however many venues sort before it', async ({ page, baseURL }) => {
	const url = new URL(baseURL!);
	await page.context().addCookies(
		[
			['city', CITY],
			['date', toLocalIsoDate(new Date())],
			['selected-genres', 'techno']
		].map(([name, value]) => ({ name, value, domain: url.hostname, path: '/' }))
	);

	await page.goto('/barfindr');
	await expect(page.locator('body')).toContainText(LATE_MATCH);
	// The fillers share no cluster with the search, so they are left out, not listed at 0%
	await expect(page.locator('body')).not.toContainText('Aaa Filler');
});
