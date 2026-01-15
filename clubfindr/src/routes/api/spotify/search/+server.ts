import { json } from '@sveltejs/kit';
import { withAccessToken } from '$lib/spotifyUtils';
import type { RequestEvent } from '@sveltejs/kit';

export const GET = async ({ url, cookies }: RequestEvent) => {
	const query = url.searchParams.get('q');
	const type = url.searchParams.get('type') || 'track';

	if (!query) {
		return json({ error: 'Query parameter is required' }, { status: 400 });
	}

	try {
		const data = await withAccessToken({
			cookies,
			endpoint: `https://api.spotify.com/v1/search?q=${encodeURIComponent(
				query
			)}&type=${type}&limit=5`
		});

		// Log the response structure to help debug
		//console.log('Spotify search response:', JSON.stringify(data, null, 2));

		if (!data || !data.tracks || !data.tracks.items) {
			console.error('Unexpected Spotify API response structure:', data);
			return json({ error: 'Invalid response from Spotify API' }, { status: 500 });
		}

		return json(data);
	} catch (error) {
		console.error('Spotify search error:', error);
		return json({ error: 'Failed to search Spotify' }, { status: 500 });
	}
};
