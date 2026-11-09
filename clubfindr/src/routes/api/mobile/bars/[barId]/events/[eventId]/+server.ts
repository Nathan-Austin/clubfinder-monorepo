// File: src/routes/api/mobile/bars/[barId]/events/[eventId]/+server.ts
//
// Editing and removing one of a venue's events from the app. EventFormScreen has always sent
// PUT here and got a 404 because the route did not exist, so only creating worked
// (KNOWN_ISSUES 27); BarHomeScreen stubs out deletion for the same reason.
//
// The body and the answers match the web dashboard's /api/bars/:barId/events/:eventId, which
// the app already expects ({ event }, { message }, { validationErrors }). Both handlers are
// writes, so they are behind the same guard as POST on the collection: only that venue, by its
// Bearer session token or the dashboard cookie ($lib/server/barAuth).

import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';
import { denyUnlessBarManager } from '$lib/server/barAuth';

/** The event must belong to this venue; a stranger's id reads as "not found", never as theirs. */
async function findEvent(eventId: string, barId: string) {
	const result = await query(`SELECT id FROM clubfindr.bar_events WHERE id = $1 AND bar_id = $2`, [
		eventId,
		barId
	]);
	return result.rows[0] ?? null;
}

export const PUT: RequestHandler = async ({ request, params, cookies }) => {
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

	const { barId, eventId } = params;

	try {
		const data = await request.json();

		const validationErrors = [];
		if (!data.theme_name) validationErrors.push('Theme name is required');
		if (!data.event_date) validationErrors.push('Event date is required');

		if (validationErrors.length > 0) {
			return json({ error: 'Validation failed', validationErrors }, { status: 400 });
		}

		if (!(await findEvent(eventId, barId))) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		const result = await query(
			`UPDATE clubfindr.bar_events SET
        theme_name = $1,
        description = $2,
        event_date = $3,
        start_time = $4,
        end_time = $5,
        recurring = $6,
        recurrence_pattern = $7,
        special_genres = $8,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND bar_id = $10
       RETURNING *`,
			[
				data.theme_name,
				data.description || '',
				data.event_date,
				data.start_time || null,
				data.end_time || null,
				data.recurring || false,
				data.recurrence_pattern || null,
				data.special_genres || [],
				eventId,
				barId
			]
		);

		return json({ message: 'Event updated successfully', event: result.rows[0] });
	} catch (error) {
		console.error('Error updating bar event:', error);
		return json({ error: 'Failed to update event' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, params, cookies }) => {
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

	const { barId, eventId } = params;

	try {
		if (!(await findEvent(eventId, barId))) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		await query(`DELETE FROM clubfindr.bar_events WHERE id = $1 AND bar_id = $2`, [eventId, barId]);

		return json({ message: 'Event deleted successfully' });
	} catch (error) {
		console.error('Error deleting bar event:', error);
		return json({ error: 'Failed to delete event' }, { status: 500 });
	}
};
