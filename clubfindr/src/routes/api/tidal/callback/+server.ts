import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cookieManager } from '$lib/cookieManager';

export const GET: RequestHandler = async ({ url, fetch, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	const savedState = cookieManager.get(cookies, 'tidal_auth_state');
	const codeVerifier = cookieManager.get(cookies, 'tidal_code_verifier');

	const client_id = import.meta.env.VITE_TIDAL_CLIENT_ID;
	const client_secret = import.meta.env.VITE_TIDAL_CLIENT_SECRET;
	const protocol = url.protocol;
	const host = url.host;
	const redirect_uri = `${protocol}//${host}/api/tidal/callback`;

	if (!state || state !== savedState) {
		console.error('Tidal State mismatch or missing');
		throw redirect(303, '/?error=tidal_state_mismatch');
	}

	if (!code) {
		console.error('No Tidal authorization code received');
		throw redirect(303, '/?error=tidal_missing_code');
	}

	if (!codeVerifier) {
		console.error('No Tidal code verifier found');
		throw redirect(303, '/?error=tidal_missing_verifier');
	}

	try {
		const tokenResponse = await fetch('https://login.tidal.com/oauth2/token', {
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
			console.error('Tidal Token exchange failed:', {
				status: tokenResponse.status,
				error: errorData
			});
			throw redirect(303, '/?error=tidal_token_exchange_failed');
		}

		const data = await tokenResponse.json();

		if (!data.access_token) {
			console.error('No access token in Tidal response');
			throw redirect(303, '/?error=tidal_invalid_token_response');
		}

		// Cleanup auth cookies
		cookieManager.delete(cookies, 'tidal_auth_state');
		cookieManager.delete(cookies, 'tidal_code_verifier');

		// Set the access token cookie
		cookieManager.set(cookies, 'tidal_access_token', data.access_token, {
			maxAge: data.expires_in ? parseInt(data.expires_in) : 3600
		});

		if (data.refresh_token) {
			cookieManager.set(cookies, 'tidal_refresh_token', data.refresh_token, {
				maxAge: 365 * 24 * 60 * 60
			});
		}

		return new Response(null, {
			status: 303,
			headers: {
				Location: '/tidal'
			}
		});
	} catch (error) {
		if (error instanceof Response && error.status === 303) {
			throw error;
		}
		console.error('Unexpected error in Tidal callback:', error);
		throw redirect(303, '/?error=tidal_server_error');
	}
};
