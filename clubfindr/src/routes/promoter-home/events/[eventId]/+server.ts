// promoter-home/events/[eventId]/+server.ts
//
// Editing and deleting a promoter's own event. Both handlers answered 500 to everyone until
// 2026-11-11: every statement named `events` unqualified, and the dev and production search_path
// is `"$user", public`, so the table was never found (`clubfindr.events`). PATCH also read and
// wrote an `event_genres` table that does not exist — genres are the `event_genres` text[] column
// on the events row itself — so it could not have worked even qualified. The same class of fault
// as the mobile stats endpoint in KNOWN_ISSUES 26.
//
// With the genres folded into the one UPDATE, PATCH is a single statement and needs no
// transaction; it used to wrap the writes in query('BEGIN')/query('COMMIT'), which on a pooled
// connection is not a transaction anyway (KNOWN_ISSUES 39).

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

		// One statement: deleting only when the event is this promoter's own leaves no window
		// between the check and the delete, and tells us which it was by what came back
		const deleted = await query(
			'DELETE FROM clubfindr.events WHERE event_id = $1 AND promoter_id = $2 RETURNING event_id',
			[eventId, userId]
		);

		if (deleted.rows.length === 0) {
			// Someone else's event is reported as missing rather than forbidden, so this cannot be
			// used to find out which event ids exist
			throw error(404, 'Event not found');
		}

		return json({ success: true });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
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

		const updated = await query(
			`UPDATE clubfindr.events
			    SET event_name = COALESCE($1, event_name),
			        club_name = COALESCE($2, club_name),
			        club_address = COALESCE($3, club_address),
			        event_date = COALESCE($4, event_date),
			        start_time = COALESCE($5, start_time),
			        end_time = COALESCE($6, end_time),
			        price = COALESCE($7, price),
			        event_image = COALESCE($8, event_image),
			        city = COALESCE($9, city),
			        event_genres = COALESCE($10, event_genres)
			  WHERE event_id = $11 AND promoter_id = $12
			  RETURNING *`,
			[
				updates.event_name ?? null,
				updates.club_name ?? null,
				updates.club_address ?? null,
				updates.event_date ?? null,
				updates.start_time ?? null,
				updates.end_time ?? null,
				updates.price ?? null,
				updates.event_image ?? null,
				updates.city ?? null,
				updates.event_genres ?? null,
				eventId,
				userId
			]
		);

		if (updated.rows.length === 0) {
			throw error(404, 'Event not found');
		}

		return json(updated.rows[0]);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Error updating event:', err);
		throw error(500, 'Failed to update event');
	}
}
