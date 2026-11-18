// File: src/routes/api/bars/[barId]/events/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';
import { denyUnlessBarManager } from '$lib/server/barAuth';
import { isKnownGenre } from '$lib/taste/genreClassifier';
import { EventGenresError, validateEventGenres } from '$lib/taste/eventGenres';
import {
	RECURRENCE_PATTERNS,
	addDays,
	expandOccurrences,
	normalizeRecurrencePattern,
	toIsoDate
} from '$lib/events/recurrence';
import { toLocalIsoDate } from '$lib/localDate';

/** How far ahead a venue's own list looks, and how many dates one series may fill it with. */
const LIST_WINDOW_DAYS = 60;
const LIST_PER_SERIES = 4;

// GET handler to retrieve all events for a specific bar
export const GET: RequestHandler = async ({ params, cookies, request, url }) => {
	const barId = params.barId;
	// Only the venue itself, by its session (KNOWN_ISSUES 52: not the plain barId cookie)
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

	try {
		// Recurring rows are series; their dates are worked out here (KNOWN_ISSUES 90)
		const result = await query(
			`SELECT * FROM clubfindr.bar_events
       WHERE bar_id = $1
       AND (event_date >= CURRENT_DATE OR recurring = true)
       ORDER BY event_date ASC`,
			[barId]
		);

		const from = toIsoDate(url.searchParams.get('date')) ?? toLocalIsoDate(new Date());
		const events = expandOccurrences(result.rows, {
			from,
			to: addDays(from, LIST_WINDOW_DAYS),
			perSeries: LIST_PER_SERIES
		});

		return json({ events });
	} catch (error) {
		console.error('Error fetching bar events:', error);
		return json({ error: 'Failed to fetch events' }, { status: 500 });
	}
};

// POST handler to create a new event for a bar
export const POST: RequestHandler = async ({ request, params, cookies }) => {
	const barId = params.barId;
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
				recurring,
				pattern,
				genres
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
