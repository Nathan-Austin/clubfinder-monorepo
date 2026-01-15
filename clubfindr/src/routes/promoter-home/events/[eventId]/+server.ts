// promoter-home/events/[eventId]/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { query } from '$lib/db';

export async function DELETE({ params, cookies }: RequestEvent) {
	try {
		const userId = cookies.get('promoterId');
		if (!userId) {
			throw error(401, 'Unauthorized');
		}

		// params.eventId is now available because of the [eventId] folder
		const eventId = params.eventId;

		const event = await query('SELECT promoter_id FROM events WHERE event_id = $1', [eventId]);

		if (!event.rows.length || event.rows[0].promoter_id !== userId) {
			throw error(403, 'Forbidden');
		}

		await query('DELETE FROM events WHERE event_id = $1', [eventId]);

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting event:', err);
		throw error(500, 'Failed to delete event');
	}
}

export async function PATCH({ request, params, cookies }: RequestEvent) {
	try {
		const userId = cookies.get('promoterId');
		if (!userId) {
			throw error(401, 'Unauthorized');
		}

		// params.eventId is now available because of the [eventId] folder
		const eventId = params.eventId;
		const updates = await request.json();

		const event = await query('SELECT promoter_id FROM events WHERE event_id = $1', [eventId]);

		if (!event.rows.length || event.rows[0].promoter_id !== userId) {
			throw error(403, 'Forbidden');
		}

		await query('BEGIN');

		try {
			await query(
				`UPDATE events 
                SET 
                    event_name = COALESCE($1, event_name),
                    club_name = COALESCE($2, club_name),
                    club_address = COALESCE($3, club_address),
                    event_date = COALESCE($4, event_date),
                    start_time = COALESCE($5, start_time),
                    end_time = COALESCE($6, end_time),
                    price = COALESCE($7, price),
                    event_image = COALESCE($8, event_image),
                    city = COALESCE($9, city)
                WHERE event_id = $10`,
				[
					updates.event_name,
					updates.club_name,
					updates.club_address,
					updates.event_date,
					updates.start_time,
					updates.end_time,
					updates.price,
					updates.event_image,
					updates.city,
					eventId
				]
			);

			if (updates.event_genres) {
				await query('DELETE FROM event_genres WHERE event_id = $1', [eventId]);

				for (const genre of updates.event_genres) {
					await query('INSERT INTO event_genres (event_id, genre) VALUES ($1, $2)', [
						eventId,
						genre
					]);
				}
			}

			await query('COMMIT');

			const updatedEvent = await query(
				`SELECT 
                    e.*,
                    ARRAY_AGG(eg.genre) as event_genres
                FROM events e
                LEFT JOIN event_genres eg ON e.event_id = eg.event_id
                WHERE e.event_id = $1
                GROUP BY e.event_id`,
				[eventId]
			);

			return json(updatedEvent.rows[0]);
		} catch (err) {
			await query('ROLLBACK');
			throw err;
		}
	} catch (err) {
		console.error('Error updating event:', err);
		throw error(500, 'Failed to update event');
	}
}
