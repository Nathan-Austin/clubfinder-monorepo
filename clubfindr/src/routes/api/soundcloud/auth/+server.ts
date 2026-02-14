// src/routes/api/soundcloud/auth.ts
// src/routes/api/soundcloud/auth/+server.ts
import { redirect } from '@sveltejs/kit';
import { generateRandomString, generateCodeChallenge } from '$lib/soundcloud/pkce';
import { cookieManager } from '$lib/cookieManager';

export const GET = async ({ cookies, url }) => {
	const client_id = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;
	const protocol = url.protocol;
	const host = url.host;
	const redirect_uri = `${protocol}//${host}/api/soundcloud/callback`;

	const state = generateRandomString(16);
	const code_verifier = generateRandomString(64);
	const code_challenge = await generateCodeChallenge(code_verifier);

	console.log('--- SoundCloud Auth Start ---');
	console.log('Host:', host);
	console.log('Redirect URI:', redirect_uri);
	console.log('State:', state);

	// Handle optional return_to parameter
	const returnTo = url.searchParams.get('return_to') || url.searchParams.get('returnTo');
	if (returnTo) {
		cookieManager.set(cookies, 'sc_return_to', returnTo, { maxAge: 600 });
	}

	// Store PKCE values in cookies for the callback
	cookieManager.set(cookies, 'sc_auth_state', state, { maxAge: 600 });
	cookieManager.set(cookies, 'sc_code_verifier', code_verifier, { maxAge: 600 });

	// Add all required scopes
	const scopes = [
		'non-expiring',
		'playlists',
		'playlists-modify',
		'activities',
		'likes',
		'following',
		'upload',
		'tracks'
	].join(' ');

	const soundcloudAuthUrl =
		`https://secure.soundcloud.com/authorize` +
		`?client_id=${client_id}` +
		`&response_type=code` +
		`&redirect_uri=${encodeURIComponent(redirect_uri)}` +
		`&scope=${encodeURIComponent(scopes)}` +
		`&state=${state}` +
		`&code_challenge=${code_challenge}` +
		`&code_challenge_method=S256`;

	throw redirect(302, soundcloudAuthUrl);
};
