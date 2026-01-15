import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db'; // adjust according to your database setup
import { json } from '@sveltejs/kit'; // Use SvelteKit's json helper for responses
import { cookieManager } from '$lib/cookieManager';
export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionId = cookieManager.get(cookies, 'sessionId'); // Fetch sessionId from cookies
	const { eventId } = await request.json(); // Destructure eventId from the JSON body

	// Check if sessionId or eventId is missing
	if (!sessionId) {
		return json({ error: 'Unauthorized: Session ID missing' }, { status: 403 });
	}
	if (!eventId) {
		return json({ error: 'Bad request: Event ID missing' }, { status: 400 });
	}

	try {
		// Fetch user_id based on the sessionId
		const result = await query(
			'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1',
			[sessionId]
		);

		if (result.rows.length === 0) {
			return json({ success: false, message: 'User ID not found' }, { status: 404 });
		}

		const userId = result.rows[0].user_id;

		// Fetch the user with their interested events
		const userResult = await query('SELECT interested_events FROM clubfindr.users WHERE id = $1', [
			userId
		]);

		if (userResult.rows.length === 0) {
			return json({ success: false, message: 'User not found' }, { status: 404 });
		}

		const interestedEvents = userResult.rows[0].interested_events || [];

		// Add the new event ID if it doesn't already exist
		if (!interestedEvents.includes(eventId)) {
			interestedEvents.push(eventId);

			// Update the interested_events array in the database
			await query('UPDATE clubfindr.users SET interested_events = $1 WHERE id = $2', [
				interestedEvents,
				userId
			]);
		}

		return json({ success: true, message: 'Event marked as interested' }, { status: 200 });
	} catch (error) {
		console.error('Error in marking event as interested:', error);
		return json({ success: false, message: 'Internal Server Error' }, { status: 500 });
	}
};
