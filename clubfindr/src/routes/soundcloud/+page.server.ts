import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SoundCloudClient } from '$lib/soundcloud/client';

export const load: PageServerLoad = async ({ cookies }) => {
	const accessToken = cookies.get('soundcloud_access_token');
	const clientId = 'JAbFFwmGokeE3qWgFgRfkiJKjhg5jQjB';

	console.log('Access Token:', accessToken?.slice(0, 10) + '...'); // Log first 10 chars for debugging
	console.log('Client ID:', clientId);

	if (!accessToken) {
		throw redirect(303, '/?error=no_auth');
	}

	try {
		const client = new SoundCloudClient(accessToken, clientId);
		const playHistory = await client.getPlayHistory();

		return {
			playHistory,
			debug: {
				playHistoryCount: playHistory.collection?.length || 0,
				accessTokenPresent: !!accessToken,
				timestamp: new Date().toISOString()
			}
		};
	} catch (err) {
		console.error('Detailed error:', err);

		// If we get a 403, it might be an authentication issue
		if (err instanceof Error && err.message.includes('403')) {
			throw redirect(303, '/?error=invalid_auth');
		}

		throw error(
			500,
			`Failed to load SoundCloud data: ${err instanceof Error ? err.message : String(err)}`
		);
	}
};
