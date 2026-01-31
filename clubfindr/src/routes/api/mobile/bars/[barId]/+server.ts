// api/mobile/bars/[id]/+server.ts
// Get details for a specific bar
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';

/**
 * Get details for a specific bar
 * Endpoint: GET /api/mobile/bars/:id
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { barId } = params;

		if (!barId) {
			return json(
				{
					success: false,
					message: 'Bar ID is required'
				},
				{ status: 400 }
			);
		}

		const barQuery = `
      SELECT 
        b.id, 
        b.name, 
        b.address, 
        b.postcode,
        b.city,
        b.website,
        b.description,
        b.phone,
                b.general_email,
        bgp.current_track_name as current_track,
        bgp.current_track_id as current_track_id,
        bgp.track_counts,
        COALESCE(
          (
            SELECT ARRAY_AGG(distinct bga.genre) 
            FROM clubfindr.bar_genre_aggregates bga 
            WHERE bga.bar_id = b.id
          ),
          '{}'::TEXT[]
        ) as genres
      FROM clubfindr.bars b
      LEFT JOIN clubfindr.bar_genre_profiles bgp ON b.id = bgp.bar_id
      WHERE b.id = $1;
    `;

		const barResult = await pool.query(barQuery, [barId]);

		if (barResult.rowCount === 0) {
			return json(
				{
					success: false,
					message: 'Bar not found'
				},
				{ status: 404 }
			);
		}

		const bar = barResult.rows[0];

		// Format current track information
		let currentTrack = null;
		if (bar.current_track) {
			// Try to extract artist from the track name
			let artist = '';
			const trackParts = bar.current_track.split(' - ');
			if (trackParts.length > 1) {
				artist = trackParts[0];
				currentTrack = {
					name: trackParts[1],
					artist: artist
				};
			} else {
				currentTrack = {
					name: bar.current_track,
					artist: 'Unknown Artist'
				};
			}
		}

		// Get recently played tracks from track counts if available
		interface TrackInfo {
			name: string;
			artist: string;
			playCount: number;
		}

		let recentTracks: TrackInfo[] = [];
		if (bar.track_counts && typeof bar.track_counts === 'object') {
			recentTracks = Object.entries(bar.track_counts as Record<string, number>)
				.map(([trackName, count]) => {
					// Try to extract artist from the track name
					let artist = '';
					let name = trackName;
					const trackParts = trackName.split(' - ');
					if (trackParts.length > 1) {
						artist = trackParts[0];
						name = trackParts[1];
					}

					return {
						name,
						artist,
						playCount: count
					} as TrackInfo;
				})
				.sort((a, b) => b.playCount - a.playCount)
				.slice(0, 5);
		}

		// Return formatted bar data
		return json({
			...bar,
			currentTrack,
			recentTracks,
			venueType: 'bar'
		});
	} catch (error) {
		console.error('Error fetching bar details:', error);
		return json(
			{
				success: false,
				message: 'Failed to fetch bar details',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * Update details for a specific bar
 * Endpoint: PATCH /api/mobile/bars/:id
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const { barId } = params;
		const updates = await request.json();

		if (!barId) {
			return json(
				{
					success: false,
					message: 'Bar ID is required'
				},
				{ status: 400 }
			);
		}

		// Build dynamic update query
		const allowedFields = [
			'name',
			'address',
			'city',
			'phone',
			'general_email',
			'description',
			'website'
		];
		const values: any[] = [];
		const setClauses: string[] = [];

		// Start parameter index at 2 because $1 is barId
		let paramIndex = 2;

		for (const [key, value] of Object.entries(updates)) {
			if (allowedFields.includes(key)) {
				setClauses.push(`${key} = $${paramIndex}`);
				values.push(value);
				paramIndex++;
			}
		}

		if (setClauses.length === 0) {
			return json(
				{
					success: false,
					message: 'No valid fields to update'
				},
				{ status: 400 }
			);
		}

		const query = `
            UPDATE clubfindr.bars 
            SET ${setClauses.join(', ')} 
            WHERE id = $1 
            RETURNING id, name, address, city, phone, general_email, description, website;
        `;

		const result = await pool.query(query, [barId, ...values]);

		if (result.rowCount === 0) {
			return json(
				{
					success: false,
					message: 'Bar not found'
				},
				{ status: 404 }
			);
		}

		return json({
			success: true,
			message: 'Profile updated successfully',
			bar: result.rows[0]
		});
	} catch (error) {
		console.error('Error updating bar profile:', error);
		return json(
			{
				success: false,
				message: 'Failed to update bar profile',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
