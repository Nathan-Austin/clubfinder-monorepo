import { redirect } from '@sveltejs/kit';
import { generateRandomString, generateCodeChallenge } from '$lib/tidal/pkce';
import { cookieManager } from '$lib/cookieManager';

export const GET = async ({ cookies, url }) => {
	const client_id = import.meta.env.VITE_TIDAL_CLIENT_ID;
	const protocol = url.protocol;
	const host = url.host;
	const redirect_uri = `${protocol}//${host}/api/tidal/callback`;

	const state = generateRandomString(16);
	const code_verifier = generateRandomString(64);
	const code_challenge = await generateCodeChallenge(code_verifier);

	// Store PKCE values in cookies for the callback
	cookieManager.set(cookies, 'tidal_auth_state', state, { maxAge: 600 });
	cookieManager.set(cookies, 'tidal_code_verifier', code_verifier, { maxAge: 600 });

	const scopes = ['user.read', 'collection.read', 'playlists.read', 'offline_access'].join(' ');

	const tidalAuthUrl =
		`https://login.tidal.com/authorize` +
		`?client_id=${client_id}` +
		`&response_type=code` +
		`&redirect_uri=${encodeURIComponent(redirect_uri)}` +
		`&scope=${encodeURIComponent(scopes)}` +
		`&state=${state}` +
		`&code_challenge=${code_challenge}` +
		`&code_challenge_method=S256`;

	throw redirect(302, tidalAuthUrl);
};
