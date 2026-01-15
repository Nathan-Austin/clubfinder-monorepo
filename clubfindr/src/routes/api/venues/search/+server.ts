// src/routes/api/venues/search/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

export async function GET({ url }) {
	const searchTerm = url.searchParams.get('term');

	if (!searchTerm) {
		return json([]);
	}

	try {
		// Search in both bars and events tables with proper type casting
		const result = await query(
			`
            WITH venue_search AS (
                SELECT DISTINCT
                    b.id::text,
                    b.name,
                    b.address,
                    b.city,
                    'existing' as source
                FROM clubfindr.bars b
                WHERE 
                    b.name ILIKE $1 OR
                    b.city ILIKE $1

                UNION ALL

                SELECT DISTINCT
                    NULL as id,
                    e.club_name as name,
                    e.club_address as address,
                    e.city,
                    'event' as source
                FROM clubfindr.events e
                WHERE 
                    e.club_name ILIKE $1 OR
                    e.city ILIKE $1
                    AND e.club_name NOT IN (SELECT name FROM clubfindr.bars)
            )
            SELECT * FROM venue_search
            ORDER BY 
                source = 'existing' DESC,  -- Prioritize existing venues
                name ASC
            LIMIT 10
        `,
			[`%${searchTerm}%`]
		);

		// Transform the results to include proper type information
		const venues = result.rows.map((row) => ({
			id: row.id,
			name: row.name,
			address: row.address,
			city: row.city,
			isExisting: row.source === 'existing'
		}));

		return json(venues);
	} catch (err) {
		console.error('Error searching venues:', err);
		return json({ error: 'Failed to search venues' }, { status: 500 });
	}
}
