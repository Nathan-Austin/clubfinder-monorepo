// promoter-home/events/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '../$types';
import { query } from '$lib/db';

export async function GET({ cookies }: RequestEvent) {
	try {
		// Ensure user is authenticated and is a promoter
		const userId = cookies.get('promoterId');
		if (!userId) {
			throw error(401, 'Unauthorized');
		}

		// Get all events for the promoter
		const events = await query(
			`SELECT 
                e.*
            FROM clubfindr.events e
            WHERE e.promoter_id = $1
            ORDER BY e.event_date DESC`,
			[userId]
		);

		return json(events.rows);
	} catch (err) {
		console.error('Error fetching events:', err);
		throw error(500, 'Failed to fetch events');
	}
}

export async function POST({ request, cookies }: RequestEvent) {
	try {
		// Ensure user is authenticated and is a promoter
		const userId = cookies.get('promoterId');
		if (!userId) {
			throw error(401, 'Unauthorized');
		}

		const eventData = await request.json();

		// Start a transaction
		await query('BEGIN');

		try {
			// Insert the event
			const result = await query(
				`INSERT INTO clubfindr.events (
                    event_name,
                    club_name,
                    club_address,
                    event_date,
                    start_time,
                    end_time,
                    event_genres,
                    price,
                    event_image,
                    city,
                    promoter_id,
                    track_ids
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING event_id`,
				[
					eventData.event_name,
					eventData.club_name,
					eventData.club_address,
					eventData.event_date,
					eventData.start_time,
					eventData.end_time,
					eventData.event_genres,
					eventData.price,
					eventData.event_image,
					eventData.city,
					userId,
					JSON.stringify(eventData.track_ids) // Convert the tracks array to JSON string
				]
			);

			const newEvent = result.rows[0]; // Get the newly created event

			// Commit the transaction
			await query('COMMIT');

			// Return the newly created event data
			return json(newEvent);
		} catch (err) {
			// Rollback the transaction if anything fails
			await query('ROLLBACK');
			throw err;
		}
	} catch (err) {
		console.error('Error creating event:', err);
		throw error(500, 'Failed to create event');
	}
}
