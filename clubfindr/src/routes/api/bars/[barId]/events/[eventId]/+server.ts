// File: src/routes/api/bars/[barId]/events/[eventId]/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';

// GET handler to retrieve a specific event
export const GET: RequestHandler = async ({ params, cookies }) => {
	const { barId, eventId } = params;
	const userBarId = cookies.get('barId');

	// Basic authorization check
	if (userBarId !== barId) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const result = await query(
			`SELECT * FROM clubfindr.bar_events 
       WHERE id = $1 AND bar_id = $2`,
			[eventId, barId]
		);

		if (result.rows.length === 0) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		return json({ event: result.rows[0] });
	} catch (error) {
		console.error('Error fetching bar event:', error);
		return json({ error: 'Failed to fetch event' }, { status: 500 });
	}
};

// PUT handler to update an existing event
export const PUT: RequestHandler = async ({ request, params, cookies }) => {
	const { barId, eventId } = params;
	const userBarId = cookies.get('barId');

	// Basic authorization check
	if (userBarId !== barId) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const data = await request.json();

		// Validate required fields
		const validationErrors = [];
		if (!data.theme_name) validationErrors.push('Theme name is required');
		if (!data.event_date) validationErrors.push('Event date is required');

		if (validationErrors.length > 0) {
			return json(
				{
					error: 'Validation failed',
					validationErrors
				},
				{ status: 400 }
			);
		}

		// Check if event exists
		const checkResult = await query(
			`SELECT id FROM clubfindr.bar_events 
       WHERE id = $1 AND bar_id = $2`,
			[eventId, barId]
		);

		if (checkResult.rows.length === 0) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		// Update event
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

		return json({
			message: 'Event updated successfully',
			event: result.rows[0]
		});
	} catch (error) {
		console.error('Error updating bar event:', error);
		return json({ error: 'Failed to update event' }, { status: 500 });
	}
};

// DELETE handler to remove an event
export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const { barId, eventId } = params;
	const userBarId = cookies.get('barId');

	// Basic authorization check
	if (userBarId !== barId) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		// Check if event exists
		const checkResult = await query(
			`SELECT id FROM clubfindr.bar_events 
       WHERE id = $1 AND bar_id = $2`,
			[eventId, barId]
		);

		if (checkResult.rows.length === 0) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		// Delete event
		await query(
			`DELETE FROM clubfindr.bar_events 
       WHERE id = $1 AND bar_id = $2`,
			[eventId, barId]
		);

		return json({ message: 'Event deleted successfully' });
	} catch (error) {
		console.error('Error deleting bar event:', error);
		return json({ error: 'Failed to delete event' }, { status: 500 });
	}
};
