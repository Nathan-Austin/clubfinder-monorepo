// api/mobile/bars/genres/+server.ts
// Get top genres for all bars
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';

interface GenreProfile {
	genre: string;
	percentage: number;
}

/**
 * Get top 5 genres for all bars based on their rolling genre profiles
 * Endpoint: GET /api/mobile/bars/genres
 */
export const GET: RequestHandler = async () => {
	try {
		// Get the latest rolling genre profile for each bar
		const query = `
            SELECT DISTINCT ON (bar_id)
                bar_id,
                rolling_genre_profile,
                b.name as bar_name
            FROM clubfindr.bar_genre_profiles bgp
            JOIN clubfindr.bars b ON b.id = bgp.bar_id
            WHERE rolling_genre_profile IS NOT NULL
            ORDER BY bar_id, timestamp DESC;
        `;

		const result = await pool.query(query);

		if (result.rowCount === 0) {
			return json({
				success: true,
				bars: []
			});
		}

		const barsWithGenres = result.rows.map((row) => {
			// Parse the rolling_genre_profile JSON and convert to array
			const genreProfile: GenreProfile[] = Object.entries(
				row.rolling_genre_profile as Record<string, number>
			)
				.map(([genre, percentage]) => ({
					genre,
					percentage
				}))
				// Sort by percentage in descending order
				.sort((a, b) => b.percentage - a.percentage)
				// Take top 5 genres
				.slice(0, 5);

			return {
				barId: row.bar_id,
				barName: row.bar_name,
				genres: genreProfile
			};
		});

		return json({
			success: true,
			bars: barsWithGenres
		});
	} catch (error) {
		console.error('Error fetching bar genres:', error);
		return json(
			{
				success: false,
				message: 'Failed to fetch bar genres',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
