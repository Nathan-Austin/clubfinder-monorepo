import { redirect } from '@sveltejs/kit';
import { cookieManager } from '$lib/cookieManager';

export const GET = async ({ url, cookies }) => {
	const token = url.searchParams.get('token');

	if (token) {
		// Set the token manually for development
		cookieManager.set(cookies, 'tidal_access_token', token, {
			maxAge: 3600 * 24 // 24 hours for testing
		});

		console.log('Manual Tidal token set for development');
		throw redirect(303, '/tidal');
	}

	return new Response('Usage: /api/tidal/debug-token?token=YOUR_ACCESS_TOKEN');
};
