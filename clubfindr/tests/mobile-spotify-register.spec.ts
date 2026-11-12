import { test, expect, mobileApi, bearer, testPassword } from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import { devQuery } from './db';

// POST /api/mobile/spotify/register stores the Spotify tokens the app obtained for a user
// (KNOWN_ISSUES 42). It used to take any user id, mint a session for it and return the
// Spotify client secret, so anyone who learned a user's id could log in as them. It now
// requires the caller's own session — the app's Bearer token or the web session cookie —
// refuses a mismatched userId, keeps the caller's existing session instead of minting one,
// and never returns a client secret.
//
// Each test signs up its own account (a login deletes the user's other sessions, so a seeded
// user would break parallel tests), through a cookie-less context so only the Bearer header
// can authenticate the calls.

const PASSWORD = testPassword();
const UNKNOWN_TOKEN = '99999999-9999-4999-8999-999999999999';

function uniqueEmail(label: string) {
	return `spotify-register-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;
}

async function signUpAndLogin(api: APIRequestContext, email: string) {
	const signup = await api.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			isMobileApp: true,
			email,
			password: PASSWORD,
			fullName: 'Spotify Register Test'
		}
	});
	expect(signup.status(), await signup.text()).toBe(200);
	const login = await api.post('/api/mobile/login', { data: { email, password: PASSWORD } });
	expect(login.status(), await login.text()).toBe(200);
	return login.json();
}

// users.spotify_email and spotify_user_id are unique, and the dev database lives across
// runs, so the profile must be fresh every time
function registerPayload(userId: string) {
	const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
	return {
		accessToken: 'mock-user-token-ok',
		refreshToken: 'mock-user-refresh-ok',
		userId,
		spotifyProfile: { id: `mock-spotify-${tag}`, email: `mock-${tag}@spotify.test` }
	};
}

test('a Spotify registration without a session is refused', async ({ playwright, baseURL }) => {
	const api = await mobileApi(playwright, baseURL);
	const { user } = await signUpAndLogin(api, uniqueEmail('anon'));

	// No Authorization header at all
	const anonymous = await api.post('/api/mobile/spotify/register', {
		data: registerPayload(user.id)
	});
	expect(anonymous.status()).toBe(401);

	// A token that is no session
	const unknown = await api.post('/api/mobile/spotify/register', {
		data: registerPayload(user.id),
		headers: bearer(UNKNOWN_TOKEN)
	});
	expect(unknown.status()).toBe(401);

	// Nothing was stored for the user
	const rows = await devQuery<{ access_token: string | null }>(
		'SELECT access_token FROM clubfindr.users WHERE id = $1',
		[user.id]
	);
	expect(rows).toEqual([{ access_token: null }]);
});

test("a session cannot register Spotify tokens on another user's account", async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const caller = await signUpAndLogin(api, uniqueEmail('caller'));
	const victim = await signUpAndLogin(api, uniqueEmail('victim'));

	const response = await api.post('/api/mobile/spotify/register', {
		data: registerPayload(victim.user.id),
		headers: bearer(caller.token)
	});
	expect(response.status()).toBe(403);

	const rows = await devQuery<{ access_token: string | null }>(
		'SELECT access_token FROM clubfindr.users WHERE id = $1',
		[victim.user.id]
	);
	expect(rows).toEqual([{ access_token: null }]);
});

test('a user registers their own Spotify tokens and keeps their session', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const { user, token } = await signUpAndLogin(api, uniqueEmail('own'));

	const response = await api.post('/api/mobile/spotify/register', {
		data: registerPayload(user.id),
		headers: bearer(token)
	});
	expect(response.status(), await response.text()).toBe(200);
	const body = await response.json();
	expect(body.success).toBe(true);

	// The caller's own token comes back; no new session is minted and nothing is logged out
	expect(body.token).toBe(token);
	expect(body.user.id).toBe(user.id);

	// The client secret stays on the server
	expect(JSON.stringify(body)).not.toContain('client_secret');
	expect(body.user.clientSecret).toBeUndefined();

	// The tokens were stored on the user and on the existing session row
	const rows = await devQuery<{ access_token: string | null; session_token: string | null }>(
		`SELECT u.access_token, s.access_token AS session_token
		   FROM clubfindr.users u
		   JOIN clubfindr.user_sessions s ON s.user_id = u.id
		  WHERE u.id = $1 AND s.session_id = $2`,
		[user.id, token]
	);
	expect(rows).toEqual([
		{ access_token: 'mock-user-token-ok', session_token: 'mock-user-token-ok' }
	]);

	// The token still authenticates after the call
	const after = await api.get('/api/taste/artists', { headers: bearer(token) });
	expect(after.status()).toBe(200);
});
