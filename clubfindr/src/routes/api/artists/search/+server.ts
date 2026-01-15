import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';

export const GET: RequestHandler = async ({ url }) => {
	const searchTerm = url.searchParams.get('term');

	try {
		const result = await query(
			`SELECT * FROM clubfindr.artists 
             WHERE artist_name ILIKE $1 
             OR email ILIKE $1 
             LIMIT 10`,
			[`%${searchTerm}%`]
		);

		// Get the first result or null if none found
		const artist = result.rows || null;
		//console.log(artist)
		return json(artist);
	} catch (error) {
		console.error('Artist search failed:', error);
		return json(null, { status: 500 });
	}
};
