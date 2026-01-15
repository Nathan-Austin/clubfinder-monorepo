// src/routes/spotify/+server.ts

import { json, type RequestHandler } from '@sveltejs/kit';
import { withAccessToken } from '$lib/spotifyUtils';

export const GET: RequestHandler = async ({ cookies, url }) => {
	try {
		const endpoint = url.searchParams.get('endpoint');
		if (!endpoint) {
			console.error('No endpoint specified');
			return json({ message: 'No endpoint specified' }, { status: 400 });
		}

		const result = await withAccessToken({ cookies, endpoint });

		return json(result, { status: 200 });
	} catch (err) {
		console.error('Error in GET handler', err);
		if (err instanceof Error) {
			return json({ message: err.message }, { status: 500 });
		} else {
			return json({ message: 'An unexpected error occurred' }, { status: 500 });
		}
	}
};
