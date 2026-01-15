// api/mobile/genre-clusters/+server.ts
// Get genre clusters data for client-side matching
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import genreClusters from '$lib/data/genreClusters.json';

/**
 * Get genre clusters data for client-side matching
 * Endpoint: GET /api/mobile/genre-clusters
 */
export const GET: RequestHandler = async () => {
	try {
		// Return the genre clusters data
		return json(genreClusters);
	} catch (error) {
		console.error('Error fetching genre clusters:', error);
		return json(
			{
				success: false,
				message: 'Failed to fetch genre clusters',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
