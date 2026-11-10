import { test, expect, mobileApi, bearer, SPOTIFY_CONNECT_ENABLED, testPassword } from './fixtures';
import type { APIRequestContext } from '@playwright/test';

// The mobile app's side of the taste profile (ROADMAP section 1, mobile parity):
//
// - mobile login answers 200 for a user without a Spotify app (it used to throw and answer
//   500, and the app fell back to /login/users) and tells the app whether to show the artist
//   picker step (user.artistOnboarding, derived from the favourite count as on the web);
// - the user taste API (/api/taste/*) takes the login token as a Bearer token, so the app uses
//   the same endpoints as the web.
//
// Every test signs up its own account through the mobile signup path of /login/users: a login
// deletes the user's other sessions, so logging in as a seeded user here would break
// tests/taste.spec.ts running in parallel. Calls go through a cookie-less context
// (tests/fixtures.ts mobileApi), so only the Bearer header can authenticate them.

const PASSWORD = testPassword();
/** Mock Spotify artists (tests/mock-spotify.ts) */
const PICKS = ['devPerihelionChoir0001', 'devVelvetMeridian00001', 'devGlassAnvil000000001'];
const UNKNOWN_TOKEN = '99999999-9999-4999-8999-999999999999';

function uniqueEmail(label: string) {
	return `mobile-taste-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;
}

async function signUp(api: APIRequestContext, email: string) {
	const response = await api.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			isMobileApp: true,
			email,
			password: PASSWORD,
			fullName: 'Mobile Taste Test'
		}
	});
	expect(response.status(), await response.text()).toBe(200);
	return response.json();
}

async function mobileLogin(api: APIRequestContext, email: string) {
	const response = await api.post('/api/mobile/login', { data: { email, password: PASSWORD } });
	expect(response.status(), await response.text()).toBe(200);
	return response.json();
}

test('mobile login works without a Spotify app and asks for the artist step', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = uniqueEmail('login');
	await signUp(api, email);

	const body = await mobileLogin(api, email);
	expect(body.success).toBe(true);
	expect(body.token).toMatch(/^[0-9a-f-]{36}$/);
	expect(body.user.artistOnboarding).toEqual({
		required: true,
		min: 3,
		max: 5,
		favouriteCount: 0
	});
	expect(body.spotifyConnectEnabled).toBe(SPOTIFY_CONNECT_ENABLED);
	// No Spotify app, so no app credentials
	expect(body.user.clientId).toBeNull();
	await api.dispose();
});

test('the login token drives the taste API; three artists complete the step', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = uniqueEmail('taste');
	await signUp(api, email);
	const { token } = await mobileLogin(api, email);

	// The very first request after login: the session row must already exist
	const empty = await api.get('/api/taste/artists', { headers: bearer(token) });
	expect(empty.status()).toBe(200);
	expect(await empty.json()).toEqual({ artists: [], genres: [] });

	const search = await api.get('/api/taste/search?q=velvet', { headers: bearer(token) });
	expect(search.status()).toBe(200);
	expect((await search.json()).artists.map((a: { name: string }) => a.name)).toContain(
		'Velvet Meridian'
	);

	const added: string[] = [];
	for (const sourceId of PICKS) {
		const response = await api.post('/api/taste/artists', {
			data: { sourceId },
			headers: bearer(token)
		});
		expect(response.status(), await response.text()).toBe(201);
		added.push((await response.json()).artist.id);
	}

	// The next login reports the step as done
	const again = await mobileLogin(api, email);
	expect(again.user.artistOnboarding).toMatchObject({ required: false, favouriteCount: 3 });

	// That login replaced the session, so the first token no longer works
	expect((await api.get('/api/taste/artists', { headers: bearer(token) })).status()).toBe(401);

	// Removing one with the new token drops back under the step's minimum
	const removed = await api.delete(`/api/taste/artists/${added[0]}`, {
		headers: bearer(again.token)
	});
	expect(removed.status()).toBe(200);
	const third = await mobileLogin(api, email);
	expect(third.user.artistOnboarding).toMatchObject({ required: true, favouriteCount: 2 });
	await api.dispose();
});

test('the fallback login path reports the artist step too, and its token works', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = uniqueEmail('fallback');
	await signUp(api, email);

	// What the app calls if /api/mobile/login fails
	const response = await api.post('/login/users', {
		data: { provider: 'local', email, password: PASSWORD, isMobileApp: true }
	});
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.user.artistOnboarding).toMatchObject({ required: true, favouriteCount: 0 });
	expect((await api.get('/api/taste/artists', { headers: bearer(body.token) })).status()).toBe(200);
	await api.dispose();
});

test('the taste API refuses a missing, unknown or malformed token', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	expect((await api.get('/api/taste/artists')).status()).toBe(401);
	expect((await api.get('/api/taste/artists', { headers: bearer(UNKNOWN_TOKEN) })).status()).toBe(
		401
	);
	// Not a uuid: refused before the database is asked (the column would reject it with an error)
	expect((await api.get('/api/taste/artists', { headers: bearer('not-a-token') })).status()).toBe(
		401
	);
	expect((await api.post('/api/taste/artists', { data: { sourceId: PICKS[0] } })).status()).toBe(
		401
	);
	await api.dispose();
});

// KNOWN_ISSUES 22: the two mobile matching endpoints never read the taste profile, so the app
// had to send genres or get a 400 — a user whose profile drives /clubs and /barfindr on the
// web got nothing from the app. The picks below are deliberately away from the seeded Berlin
// venues' house/techno so the profile has to be what reaches the result.
test('mobile matching falls back to the caller’s taste profile', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = uniqueEmail('matching');
	await signUp(api, email);
	const { token } = await mobileLogin(api, email);
	const auth = bearer(token);

	const matchBars = (data: Record<string, unknown>, headers: Record<string, string> = {}) =>
		api.post('/api/mobile/bars/matching', { data, headers });

	// With no genres and nothing to fall back on, the answer is still the old 400
	expect((await matchBars({ city: 'Berlin' }, auth)).status(), 'empty profile').toBe(400);
	expect((await matchBars({ city: 'Berlin' })).status(), 'not logged in at all').toBe(400);

	// Build a profile: Perihelion Choir is ambient / modern classical (tests/mock-spotify.ts)
	const added = await api.post('/api/taste/artists', {
		data: { sourceId: 'devPerihelionChoir0001' },
		headers: auth
	});
	expect(added.status(), await added.text()).toBe(201);
	expect((await added.json()).genres).toContain('ambient');

	// Now the same call is answered, and matches what the profile says
	const response = await matchBars({ city: 'Berlin' }, auth);
	expect(response.status(), await response.text()).toBe(200);
	const bars = (await response.json()) as { name: string; similarity: number }[];
	const best = bars.filter((bar) => bar.similarity > 0).map((bar) => bar.name);
	expect(best, 'the ambient venue, not the house and techno ones').toContain('Fern & Feedback');

	// A caller that sends its own genres is unaffected by its profile
	const explicit = await matchBars({ city: 'Berlin', genres: ['deep house'] }, auth);
	expect(explicit.status()).toBe(200);
	const byPick = (await explicit.json()) as { name: string; similarity: number }[];
	expect(byPick.filter((bar) => bar.similarity > 0).map((bar) => bar.name)).toContain(
		'The Copper Lantern'
	);

	// The events endpoint reads the profile the same way
	const events = await api.post('/api/mobile/events/matching', {
		data: { city: 'Berlin', date: '2031-06-21' },
		headers: auth
	});
	expect(events.status(), await events.text()).toBe(200);
	expect(
		(
			await api.post('/api/mobile/events/matching', {
				data: { city: 'Berlin', date: '2031-06-21' }
			})
		).status(),
		'no token, no profile'
	).toBe(400);

	await api.dispose();
});
