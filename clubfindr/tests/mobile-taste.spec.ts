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
