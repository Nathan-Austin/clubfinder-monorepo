// promoter-home/events/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '../$types';
import { pool, query } from '$lib/db';
import { requirePromoter } from '$lib/server/promoterAuth';

// The promoter is taken from their session ($lib/server/promoterAuth), outside each try: the
// catch below answers 500 to everything, which is what the 401 thrown inside it used to become.

export async function GET({ cookies }: RequestEvent) {
	const userId = await requirePromoter(pool, cookies);
	try {
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
	const userId = await requirePromoter(pool, cookies);
	try {
		const eventData = await request.json();

		// One INSERT, atomic by itself. It used to sit inside query('BEGIN') … query('COMMIT'),
		// which on a pooled connection is not a transaction (KNOWN_ISSUES 39).
		// events.event_id is the key the edit and delete routes below look an event up by (the
		// scrapers fill it with the source's id); it has no default, and this INSERT left it NULL,
		// so no event created here could ever be edited or deleted (KNOWN_ISSUES 63).
		const result = await query(
			`INSERT INTO clubfindr.events (
                    event_id,
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
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING event_id`,
			[
				crypto.randomUUID(),
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

		return json(newEvent);
	} catch (err) {
		console.error('Error creating event:', err);
		throw error(500, 'Failed to create event');
	}
}
