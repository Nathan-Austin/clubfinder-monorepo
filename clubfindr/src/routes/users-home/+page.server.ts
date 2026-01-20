// src/routes/users-home/+page.server.ts
import { query } from '$lib/db';
import type { PageServerLoad } from '../$types';
import { cookieManager } from '$lib/cookieManager';
// Define interfaces for our data structures
interface Preference {
	genre: string;
	search_count: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _Event {
	event_id: number;
	club_name: string;
	event_name: string;
	event_date: string;
	attended?: string;
	likedRecommendation?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _ConnectedServices {
	spotify: boolean;
	soundcloud: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _UserData {
	name: string | null;
	preferences: string | Preference[] | null;
	interested_events: string | number[] | null;
	has_spotify: boolean;
}

export const load: PageServerLoad = async ({ cookies }) => {
	const user_id = cookieManager.get(cookies, 'usersId');
	const sessionId = cookieManager.get(cookies, 'sessionId');

	// Initialize connected services status
	const connectedServices = {
		spotify: false,
		soundcloud: false
	};

	if (!user_id && !sessionId) {
		return {
			props: {
				userName: null,
				topPreferences: [],
				interestedEvents: [],
				connectedServices
			},
			status: 403,
			error: 'Unauthorized'
		};
	}

	// Determine the user ID to use - prefer usersId if available, fall back to sessionId
	let userId = user_id;

	if (!userId && sessionId) {
		// Try to get user ID from session
		const sessionResult = await query(
			'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1',
			[sessionId]
		);

		if (sessionResult.rows.length > 0) {
			userId = sessionResult.rows[0].user_id.toString();
		}
	}

	if (!userId) {
		return {
			props: {
				userName: null,
				topPreferences: [],
				interestedEvents: [],
				connectedServices
			},
			status: 404,
			error: 'User not found'
		};
	}

	// Fetch user data from the database with connected services info
	// Only check for spotify_user_id since soundcloud_user_id doesn't exist
	const result = await query(
		`SELECT 
			name, 
			preferences, 
			interested_events,
			spotify_user_id IS NOT NULL AS has_spotify
		FROM clubfindr.users 
		WHERE id = $1`,
		[userId]
	);

	const user = result?.rows?.[0]; // Get the first row from the 'rows' array

	if (!user) {
		return {
			props: {
				userName: null,
				topPreferences: [],
				interestedEvents: [],
				connectedServices
			},
			status: 404,
			error: 'User not found'
		};
	}

	// Update connected services status (only Spotify since SoundCloud column doesn't exist)
	connectedServices.spotify = user.has_spotify || false;
	// soundcloud remains false since the column doesn't exist

	let preferences = [];

	// Check if preferences exist and handle string or array format
	if (user.preferences) {
		// If preferences is a string, parse it
		if (typeof user.preferences === 'string') {
			try {
				preferences = JSON.parse(user.preferences);
			} catch (error) {
				console.error('Error parsing preferences:', error);
			}
		} else if (Array.isArray(user.preferences)) {
			preferences = user.preferences;
		}
	}

	// Sort the preferences by search_count in descending order
	preferences.sort((a: Preference, b: Preference) => b.search_count - a.search_count);

	// Take the top 30 preferences
	const topPreferences = preferences.slice(0, 30);

	// Fetch interested events based on interested_events field
	let interestedEvents = [];
	if (user.interested_events) {
		// Assuming interested_events is stored as a JSONB array in the database
		let eventIds: (string | number)[] = [];

		if (typeof user.interested_events === 'string') {
			try {
				const parsed = JSON.parse(user.interested_events);
				if (Array.isArray(parsed)) {
					eventIds = parsed;
				}
			} catch (error) {
				console.error('Error parsing interested_events:', error);
			}
		} else if (Array.isArray(user.interested_events)) {
			eventIds = user.interested_events;
		}

		if (Array.isArray(eventIds) && eventIds.length > 0) {
			const eventsResult = await query(
				`SELECT event_id, club_name, event_name, event_date
				FROM clubfindr.events
				WHERE event_id = ANY($1)`,
				[eventIds]
			);
			interestedEvents = eventsResult.rows; // Store the fetched event details
		}
	}

	// Return the user data, interested events, and connected services status as props
	return {
		props: {
			userName: user.name || null,
			topPreferences,
			interestedEvents,
			connectedServices
		}
	};
};
