// api/mobile/events/+server.ts
// Route for mobile discovery page to get clubs in users city
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { geocodeAddress } from '$lib/geocoding'; // You'll need to implement this

// Keep the existing GET handler for web usage
export const GET: RequestHandler = async ({ url }) => {
	try {
		// Extract parameters from query
		const city = url.searchParams.get('city')?.toLowerCase();
		const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
		const nearby = url.searchParams.get('nearby') === 'true';

		if (!city) {
			return json({ error: 'City parameter is required' }, { status: 400 });
		}

		// Query to get clubs and their events
		const eventResult = await query(
			nearby
				? `SELECT DISTINCT ON (e.club_name)
                  e.id,
                  e.event_name, 
                  e.club_name as name, 
                  e.club_address as address,
                  e.city, 
                  e.event_date,
                  e.start_time,
                  e.end_time,
                  e.price,
                  e.popularity,
                  e.event_image,
                  COALESCE(e.event_genres, '{}') as genres
                FROM 
                  clubfindr.events e
                WHERE 
                  e.city = $1
                ORDER BY 
                  e.club_name, e.event_date DESC`
				: `SELECT 
                  e.id,
                  e.event_name, 
                  e.club_name as name, 
                  e.club_address as address,
                  e.city, 
                  e.event_date,
                  e.start_time,
                  e.end_time,
                  e.price,
                  e.popularity,
                  e.event_image,
                  COALESCE(e.event_genres, '{}') as genres
                FROM 
                  clubfindr.events e
                WHERE 
                  e.city = $1
                  AND e.event_date >= $2
                ORDER BY 
                  e.event_date ASC, 
                  e.start_time ASC;`,
			[city, date]
		);

		if (!eventResult.rows || eventResult.rows.length === 0) {
			return json([], { status: 200 }); // Return empty array instead of 404
		}

		// Format the results to match what the mobile app expects
		const formattedEvents = await Promise.all(
			eventResult.rows.map(async (event) => {
				// Generate coordinates via geocoding if possible
				let latitude, longitude;
				try {
					const coordinates = await geocodeAddress(event.address, event.city);
					if (coordinates) {
						latitude = coordinates.latitude;
						longitude = coordinates.longitude;
					}
				} catch (error) {
					console.error(`Error geocoding address for event ${event.id}:`, error);
				}

				return {
					id: event.id,
					name: event.name,
					address: event.address,
					genres: event.genres || [],
					similarity: parseFloat((Math.random() * 0.3 + 0.6).toFixed(2)), // Random score between 0.6-0.9
					city: event.city,
					// Add club-specific event fields
					event_name: event.event_name,
					event_date: event.event_date,
					start_time: event.start_time,
					end_time: event.end_time,
					price: event.price,
					popularity: event.popularity,
					event_image: event.event_image,
					// Add coordinates if available
					latitude,
					longitude,
					venueType: 'club' // Mark explicitly as a club
				};
			})
		);

		return json(formattedEvents);
	} catch (error) {
		console.error('Local event data Error:', error);
		return json(
			{
				error: 'Event data request failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

// Add a POST handler for mobile app usage
export const POST: RequestHandler = async ({ request }) => {
	console.log('========================');
	console.log('MOBILE EVENTS REQUEST (POST)');
	console.log('========================');

	const startTime = Date.now();

	try {
		// Parse request body
		const data = await request.json();
		console.log('Request data received:', data);

		const { city, date = new Date().toISOString().split('T')[0], nearby } = data;
		console.log('Parsed parameters:', { city, date, nearby });
		// Basic validation
		if (!city) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Missing city parameter'
				}),
				{
					status: 400,
					headers: {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*'
					}
				}
			);
		}

		// Query to get events
		const dbStart = Date.now();
		const eventResult = await query(
			nearby
				? `SELECT DISTINCT ON (e.club_name)
                  e.id,
                  e.event_name, 
                  e.club_name as name, 
                  e.club_address as address,
                  e.city, 
                  e.event_date,
                  e.start_time,
                  e.end_time,
                  e.price,
                  e.popularity,
                  e.event_image,
                  COALESCE(e.event_genres, '{}') as genres
                FROM 
                  clubfindr.events e
                WHERE 
                  e.city = $1
                ORDER BY 
                  e.club_name, e.event_date DESC`
				: `SELECT 
                  e.id,
                  e.event_name, 
                  e.club_name as name, 
                  e.club_address as address,
                  e.city, 
                  e.event_date,
                  e.start_time,
                  e.end_time,
                  e.price,
                  e.popularity,
                  e.event_image,
                  COALESCE(e.event_genres, '{}') as genres
                FROM 
                  clubfindr.events e
                WHERE 
                  e.city = $1
                  AND e.event_date >= $2
                ORDER BY 
                  e.event_date ASC, 
                  e.start_time ASC;`,
			nearby ? [city.toLowerCase()] : [city.toLowerCase(), date]
		);

		console.log('Database lookup:', Date.now() - dbStart, 'ms');

		if (!eventResult.rows || eventResult.rows.length === 0) {
			console.log(`No events found for city: ${city}`);
			// Return empty array instead of error
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}

		// Format the results with geocoding
		const formattedEvents = await Promise.all(
			eventResult.rows.map(async (event) => {
				// Generate coordinates via geocoding if possible
				let latitude, longitude;
				try {
					const coordinates = await geocodeAddress(event.address, event.city);
					if (coordinates) {
						latitude = coordinates.latitude;
						longitude = coordinates.longitude;
					}
				} catch (error) {
					console.error(`Error geocoding address for event ${event.id}:`, error);
				}

				return {
					id: event.id,
					name: event.name,
					address: event.address,
					city: event.city,
					genres: event.genres || [],
					// Include all event-specific fields
					event_name: event.event_name,
					event_date: event.event_date,
					start_time: event.start_time,
					end_time: event.end_time,
					price: event.price,
					popularity: event.popularity,
					event_image: event.event_image,
					// Random similarity score
					similarity: parseFloat((Math.random() * 0.3 + 0.6).toFixed(2)),
					// Include coordinates if available
					latitude,
					longitude,
					venueType: 'club' // Mark explicitly as a club
				};
			})
		);

		console.log(`Found ${formattedEvents.length} events for ${city}`);
		console.log('Total processing time:', Date.now() - startTime, 'ms');

		// Return the events
		return new Response(JSON.stringify(formattedEvents), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			}
		});
	} catch (error) {
		console.error('Error fetching events:', error);

		return new Response(
			JSON.stringify({
				success: false,
				message: error instanceof Error ? error.message : 'Server error'
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				}
			}
		);
	}
};

// Handle OPTIONS requests for CORS preflight
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization'
		}
	});
};
