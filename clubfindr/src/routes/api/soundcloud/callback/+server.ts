import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch, cookies }) => {
	const code = url.searchParams.get('code');
	const client_id = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;
	const client_secret = import.meta.env.VITE_SOUNDCLOUD_CLIENT_SECRET;
	const redirect_uri = 'https://www.clubfindr.com/api/soundcloud/callback';

	// Validate required environment variables
	//if (!client_id || !client_secret) {
	//	console.error('Missing required environment variables');
	//	throw error(500, 'Server configuration error');
	//}

	if (!code) {
		console.error('No authorization code received');
		throw redirect(303, '/?error=missing_code');
	}

	try {
		const tokenResponse = await fetch('https://api.soundcloud.com/oauth2/token', {
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
				code
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

		console.log('Token response data:', data);

		if (!data.access_token) {
			console.error('No access token in response');
			throw redirect(303, '/?error=invalid_token_response');
		}

		// Success logging
		console.info('Token exchange successful:', {
			hasAccessToken: true,
			scope: data.scope || 'default',
			expiresIn: data.expires_in
		});

		// Set the access token cookie
		cookies.set('soundcloud_access_token', data.access_token, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: data.expires_in ? parseInt(data.expires_in) : 365 * 24 * 60 * 60
		});
		cookies.set('soundcloud_app_client_id', client_id, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 365 * 24 * 60 * 60
		});

		cookies.set('soundcloud_oauth_client_id', data.client_id, {
			// OAuth client ID
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: data.expires_in ? parseInt(data.expires_in) : 365 * 24 * 60 * 60
		});

		if (data.refresh_token) {
			cookies.set('soundcloud_refresh_token', data.refresh_token, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 365 * 24 * 60 * 60
			});
		}

		if (data.scope) {
			cookies.set('soundcloud_scope', data.scope, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: data.expires_in ? parseInt(data.expires_in) : 365 * 24 * 60 * 60
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
