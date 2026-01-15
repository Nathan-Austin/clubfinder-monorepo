// File: src/routes/api/bars/[barId]/events/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';

// GET handler to retrieve all events for a specific bar
export const GET: RequestHandler = async ({ params, cookies }) => {
	const barId = params.barId;
	const userBarId = cookies.get('barId');

	// Basic authorization check
	if (userBarId !== barId) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		const result = await query(
			`SELECT * FROM clubfindr.bar_events 
       WHERE bar_id = $1
       ORDER BY event_date ASC`,
			[barId]
		);

		return json({ events: result.rows });
	} catch (error) {
		console.error('Error fetching bar events:', error);
		return json({ error: 'Failed to fetch events' }, { status: 500 });
	}
};

// POST handler to create a new event for a bar
export const POST: RequestHandler = async ({ request, params, cookies }) => {
	const barId = params.barId;
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

		// Insert new event
		const result = await query(
			`INSERT INTO clubfindr.bar_events (
        bar_id,
        theme_name,
        description,
        event_date,
        start_time,
        end_time,
        recurring,
        recurrence_pattern,
        special_genres
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
			[
				barId,
				data.theme_name,
				data.description || '',
				data.event_date,
				data.start_time || null,
				data.end_time || null,
				data.recurring || false,
				data.recurrence_pattern || null,
				data.special_genres || []
			]
		);

		return json({
			message: 'Event created successfully',
			event: result.rows[0]
		});
	} catch (error) {
		console.error('Error creating bar event:', error);
		return json({ error: 'Failed to create event' }, { status: 500 });
	}
};
