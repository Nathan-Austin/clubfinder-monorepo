// File: src/routes/api/bars/[barId]/events/[eventId]/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';
import { denyUnlessBarManager } from '$lib/server/barAuth';
import { isKnownGenre } from '$lib/taste/genreClassifier';
import { EventGenresError, validateEventGenres } from '$lib/taste/eventGenres';
import { RECURRENCE_PATTERNS, normalizeRecurrencePattern, toIsoDate } from '$lib/events/recurrence';

// GET handler to retrieve a specific event
export const GET: RequestHandler = async ({ params, cookies, request }) => {
	const { barId, eventId } = params;
	// Only the venue itself, by its session (KNOWN_ISSUES 52: not the plain barId cookie)
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

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
	// Only the venue itself, by its session (KNOWN_ISSUES 52: not the plain barId cookie)
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

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

		// Strict event genres (KNOWN_ISSUES 91): only genres the matcher knows, so a night
		// cannot be described with something that reaches nobody
		let genres: string[];
		try {
			genres = validateEventGenres(data.special_genres, isKnownGenre);
		} catch (error) {
			if (error instanceof EventGenresError) {
				return json(
					{ error: 'Validation failed', validationErrors: [error.message], genres: error.genres },
					{ status: 400 }
				);
			}
			throw error;
		}

		// A recurring event must say how it repeats, in one of the patterns occurrences are
		// worked out from (KNOWN_ISSUES 90); free text used to be stored and then ignored
		// Live music is an attribute of the night, not a genre (ROADMAP section 5)
		const liveMusic = data.live_music === true;
		const recurring = data.recurring === true;
		const pattern = recurring ? normalizeRecurrencePattern(data.recurrence_pattern) : null;
		if (recurring && !pattern) {
			return json(
				{
					error: 'Validation failed',
					validationErrors: [
						`A repeating event needs one of these patterns: ${RECURRENCE_PATTERNS.join(', ')}`
					]
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
        live_music = $11,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND bar_id = $10
       RETURNING *`,
			[
				data.theme_name,
				data.description || '',
				data.event_date,
				data.start_time || null,
				data.end_time || null,
				recurring,
				pattern,
				genres,
				eventId,
				barId,
				liveMusic
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
export const DELETE: RequestHandler = async ({ params, cookies, request, url }) => {
	const { barId, eventId } = params;
	// Only the venue itself, by its session (KNOWN_ISSUES 52: not the plain barId cookie)
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

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

		// Cancelling one date of a series rather than deleting it (KNOWN_ISSUES 89): ?date=
		// records a skipped date, which the occurrence function leaves out everywhere
		const cancelDate = toIsoDate(url.searchParams.get('date'));
		if (url.searchParams.get('date') && !cancelDate) {
			return json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
		}
		if (cancelDate) {
			await query(
				`INSERT INTO clubfindr.bar_event_skips (event_id, skip_date)
				 VALUES ($1, $2)
				 ON CONFLICT (event_id, skip_date) DO NOTHING`,
				[eventId, cancelDate]
			);
			return json({ message: 'That date has been cancelled', cancelledDate: cancelDate });
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
