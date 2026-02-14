import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cookieManager } from '$lib/cookieManager';

export const GET: RequestHandler = async ({ url, fetch, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	console.log('--- SoundCloud Callback Received ---');
	console.log('Full URL:', url.toString());
	console.log('Code present:', !!code);
	console.log('State received:', state);

	const protocol = url.protocol;
	const host = url.host;
	const redirect_uri = `${protocol}//${host}/api/soundcloud/callback`;

	const savedState = cookieManager.get(cookies, 'sc_auth_state');
	const codeVerifier = cookieManager.get(cookies, 'sc_code_verifier');

	if (!state || state !== savedState) {
		console.error('State mismatch or missing');
		throw redirect(303, '/?error=state_mismatch');
	}

	if (!code) {
		console.error('No authorization code received');
		throw redirect(303, '/?error=missing_code');
	}

	if (!codeVerifier) {
		console.error('No code verifier found');
		throw redirect(303, '/?error=missing_verifier');
	}

	try {
		const tokenResponse = await fetch('https://secure.soundcloud.com/oauth/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json'
			},
			body: new URLSearchParams({
				client_id,
				client_secret,
				redirect_uri,
				grant_type: 'authorization_code',
				code,
				code_verifier: codeVerifier
			}).toString()
		});

		if (!tokenResponse.ok) {
			const errorData = await tokenResponse.text();
			console.error('Token exchange failed:', {
				status: tokenResponse.status,
				error: errorData
			});

			if (tokenResponse.status === 401) {
				throw redirect(303, '/?error=unauthorized');
			}
			throw redirect(303, '/?error=token_exchange_failed');
		}

		const data = await tokenResponse.json();

		if (!data.access_token) {
			console.error('No access token in response');
			throw redirect(303, '/?error=invalid_token_response');
		}

		// Success logging
		console.info('Token exchange successful');

		// Cleanup auth cookies
		cookieManager.delete(cookies, 'sc_auth_state');
		cookieManager.delete(cookies, 'sc_code_verifier');

		// Set the access token cookie
		cookieManager.set(cookies, 'soundcloud_access_token', data.access_token, {
			maxAge: data.expires_in ? parseInt(data.expires_in) : 3600
		});

		if (data.refresh_token) {
			cookieManager.set(cookies, 'soundcloud_refresh_token', data.refresh_token, {
				maxAge: 365 * 24 * 60 * 60
			});
		}

		return new Response(null, {
			status: 303,
			headers: {
				Location: '/soundcloud'
			}
		});
	} catch (error) {
		if (error instanceof Response && error.status === 303) {
			throw error; // Re-throw redirects
		}
		console.error('Unexpected error in callback:', error);
		throw redirect(303, '/?error=server_error');
	}
};
