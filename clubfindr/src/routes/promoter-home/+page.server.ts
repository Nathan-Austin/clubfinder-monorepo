// promoter-home/+page.server.ts

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { query } from '$lib/db';

export const load: PageServerLoad = async ({ cookies }) => {
	try {
		// Ensure user is authenticated and is a promoter
		const promoterId = cookies.get('promoterId');
		if (!promoterId) {
			throw error(401, 'Unauthorized');
		}

		// Get all events for the promoter with their associated artists
		const eventsQuery = `
            SELECT 
                e.*,
                json_agg(
                    DISTINCT jsonb_build_object(
                        'id', a.id,
                        'artist_name', a.artist_name,
                        'spotify_uri', a.spotify_uri,
                        'soundcloud_link', a.soundcloud_link,
                        'bandcamp_link', a.bandcamp_link,
                        'facebook_link', a.facebook_link,
                        'instagram_link', a.instagram_link,
                        'ra_link', a.ra_link,
                        'genres', a.genres,
                        'email', a.email,
                        'website', a.website,
                        'primary_city', a.primary_city
                    )
                ) FILTER (WHERE a.id IS NOT NULL) as artists
            FROM clubfindr.events e
            LEFT JOIN clubfindr.event_artists ea ON e.id = ea.event_id
            LEFT JOIN clubfindr.artists a ON ea.artist_id = a.id
            WHERE e.promoter_id = $1
            GROUP BY e.id
            ORDER BY e.event_date DESC`;

		const events = await query(eventsQuery, [promoterId]);

		// Get venues associated with the promoter
		const venuesQuery = `
            SELECT 
                id,
                name,
                address,
                city,
                phone,
                website,
                general_email
            FROM clubfindr.bars
            WHERE user_id = $1
            ORDER BY name`;

		const venues = await query(venuesQuery, [promoterId]);

		// Split events into current and past
		const now = new Date();
		const currentEvents = events.rows.filter((event) => new Date(event.event_date) >= now);
		const pastEvents = events.rows.filter((event) => new Date(event.event_date) < now);

		return {
			currentEvents: currentEvents.map((event) => ({
				...event,
				artists: event.artists || []
			})),
			pastEvents: pastEvents.map((event) => ({
				...event,
				artists: event.artists || []
			})),
			venues: venues.rows
		};
	} catch (err) {
		console.error('Error loading promoter data:', err);
		throw error(500, 'Failed to load promoter data');
	}
};
