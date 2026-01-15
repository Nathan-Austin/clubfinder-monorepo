// api/mobile/events/[club_name]/+server.ts
// Get details for a specific event
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';

// Helper for price conversion
const convertPriceToNumeric = (priceStr: string | null): number => {
	if (!priceStr) return 0;

	// Remove unwanted characters except digits, dots, commas, slashes, and hyphens
	priceStr = priceStr.replace(/[^\d.,/-]/g, '');

	// Replace commas with dots to standardize decimal points
	priceStr = priceStr.replace(/,/g, '.');

	// Split the string on slashes and hyphens to handle ranges and multiple prices
	const separators = /[/-]/;
	const parts = priceStr.split(separators);

	const numbers: number[] = [];

	for (let part of parts) {
		part = part.trim();
		if (part.length === 0) continue;

		// Parse the number and check for validity
		const parsedValue = parseFloat(part);
		if (!isNaN(parsedValue)) {
			numbers.push(parsedValue);
		}
	}

	if (numbers.length === 0) {
		// No valid numbers found
		return 0;
	}

	// Return the minimum price found
	return Math.min(...numbers);
};

/**
 * Get details for a specific event
 * Endpoint: GET /api/mobile/events/:id
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { club_name } = params;

		if (!club_name) {
			return json(
				{
					success: false,
					message: 'Event ID is required'
				},
				{ status: 400 }
			);
		}

		const eventQuery = `
      SELECT 
        e.id,
        e.event_id as source_event_id,
        e.event_name as name,
        e.club_name,
        e.club_address as address,
        e.event_date as date,
        e.start_time,
        e.end_time,
        e.popularity,
        e.price,
        e.event_image,
        e.city,
        e.event_genres as genres,
        e.track_ids
      FROM clubfindr.events e
      WHERE e.club_name ILIKE $1
	  	AND e.event_date >= CURRENT_DATE
		ORDER BY e.event_date ASC;;
    `;

		const eventResult = await pool.query(eventQuery, [club_name]);

		if (eventResult.rowCount === 0) {
			return json(
				{
					success: false,
					message: 'Event not found'
				},
				{ status: 404 }
			);
		}

		return json(
			eventResult.rows.map((event) => ({
				...event,
				genres: Array.isArray(event.genres) ? event.genres : [],
				price: convertPriceToNumeric(event.price),
				venueType: 'club'
			}))
		);
	} catch (error) {
		console.error('Error fetching event details:', error);
		return json(
			{
				success: false,
				message: 'Failed to fetch event details',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
