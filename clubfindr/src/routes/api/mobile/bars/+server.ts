// api/mobile/bars/+server.ts
// Route for mobile discovery page to get bars in users city
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';

// Keep the existing GET handler for web usage
export const GET: RequestHandler = async ({ url }) => {
	try {
		// Extract city from query parameters
		const city = url.searchParams.get('city')?.toLowerCase();

		if (!city) {
			return json({ error: 'City parameter is required' }, { status: 400 });
		}

		// Query to get bars and their latest rolling genre profile
		const bar_result = await query(
			`WITH latest_profiles AS (
                SELECT DISTINCT ON (bar_id)
                    bar_id,
                    rolling_genre_profile,
                    current_track_name,
                    current_genres,
                    "timestamp"
                FROM clubfindr.bar_genre_profiles
                ORDER BY bar_id, "timestamp" DESC
            )
            SELECT
                b.id,
                b.name,
                b.address,
                b.city,
                b.phone,
                b.description,
                b.opening_hours,
                b.smoking_allowed,
                b.bar_types,
                lp.rolling_genre_profile,
                lp.current_track_name,
                lp.current_genres,
                lp.timestamp
            FROM clubfindr.bars b
            LEFT JOIN latest_profiles lp ON b.id = lp.bar_id
            WHERE LOWER(b.city) = $1`,
			[city]
		);

		if (!bar_result.rows || bar_result.rows.length === 0) {
			return json([], { status: 200 }); // Return empty array instead of 404
		}

		// Format the results to match what the mobile app expects
		const formattedBars = bar_result.rows.map((bar) => {
			// Extract top genres from rolling_genre_profile
			let genres: string[] = [];
			if (bar.rolling_genre_profile) {
				// Sort genres by their score values (descending) and take the top 5
				genres = Object.entries(bar.rolling_genre_profile as Record<string, number>)
					.sort((a, b) => b[1] - a[1]) // Sort by score (highest first)
					.slice(0, 5) // Take top 5
					.map((entry) => entry[0]); // Get just the genre names
			}

			// Only show current track if it's recent (within last 10 minutes)
			let currentTrack = null;
			if (bar.current_track_name && bar.timestamp) {
				const trackAge = Date.now() - new Date(bar.timestamp).getTime();
				const tenMinutesInMs = 10 * 60 * 1000;
				if (trackAge < tenMinutesInMs) {
					currentTrack = {
						name: bar.current_track_name,
						artist: 'Various Artists' // Placeholder for artist
					};
				}
			}

			return {
				id: bar.id,
				name: bar.name,
				address: bar.address,
				genres: genres,
				currentTrack: currentTrack,
				// Add a random similarity score - you can calculate a real one later
				similarity: Math.random().toFixed(2),
				smoking_allowed: bar.smoking_allowed || false,
				bar_types: bar.bar_types || []
			};
		});

		return json(formattedBars);
	} catch (error) {
		console.error('Local Bar data Error:', error);
		return json(
			{
				error: 'Bar data request failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

// Add a POST handler for mobile app usage that follows the same pattern as the login endpoint
export const POST: RequestHandler = async ({ request }) => {
	console.log('========================');
	console.log('MOBILE BARS REQUEST (POST)');
	console.log('========================');

	const startTime = Date.now();

	try {
		// Parse request body
		const data = await request.json();
		console.log('Request data received:', data);

		const { city } = data;

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

		// Query to get bars and their latest rolling genre profile
		const dbStart = Date.now();
		const bar_result = await query(
			`WITH latest_profiles AS (
                SELECT DISTINCT ON (bar_id)
                    bar_id,
                    rolling_genre_profile,
                    current_track_name,
                    current_genres,
                    "timestamp"
                FROM clubfindr.bar_genre_profiles
                ORDER BY bar_id, "timestamp" DESC
            )
            SELECT
                b.id,
                b.name,
                b.address,
                b.city,
                b.phone,
                b.description,
                b.opening_hours,
                b.smoking_allowed,
                b.bar_types,
                lp.rolling_genre_profile,
                lp.current_track_name,
                lp.current_genres,
                lp.timestamp
            FROM clubfindr.bars b
            LEFT JOIN latest_profiles lp ON b.id = lp.bar_id
            WHERE LOWER(b.city) = $1`,
			[city.toLowerCase()]
		);

		console.log('Database lookup:', Date.now() - dbStart, 'ms');

		if (!bar_result.rows || bar_result.rows.length === 0) {
			console.log(`No bars found for city: ${city}`);
			// Return empty array instead of error
			return new Response(JSON.stringify([]), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}

		// Format the results to match what the mobile app expects
		const formattedBars = bar_result.rows.map((bar) => {
			// Extract top genres from rolling_genre_profile
			let genres: string[] = [];
			if (bar.rolling_genre_profile) {
				// Sort genres by their score values (descending) and take the top 5
				genres = Object.entries(bar.rolling_genre_profile as Record<string, number>)
					.sort((a, b) => b[1] - a[1]) // Sort by score (highest first)
					.slice(0, 5) // Take top 5
					.map((entry) => entry[0]); // Get just the genre names
			}

			// Only show current track if it's recent (within last 10 minutes)
			let currentTrack = null;
			if (bar.current_track_name && bar.timestamp) {
				const trackAge = Date.now() - new Date(bar.timestamp).getTime();
				const tenMinutesInMs = 10 * 60 * 1000;
				if (trackAge < tenMinutesInMs) {
					currentTrack = {
						name: bar.current_track_name,
						artist: 'Various Artists' // Placeholder for artist
					};
				}
			}

			return {
				id: bar.id,
				name: bar.name,
				address: bar.address,
				city: bar.city,
				genres: genres,
				currentTrack: currentTrack,
				// Add a random similarity score - you can calculate a real one later
				similarity: Math.random().toFixed(2),
				description: bar.description,
				openingHours: bar.opening_hours,
				phone: bar.phone,
				smoking_allowed: bar.smoking_allowed || false,
				bar_types: bar.bar_types || []
			};
		});

		console.log(`Found ${formattedBars.length} bars for ${city}`);
		console.log('Total processing time:', Date.now() - startTime, 'ms');

		// Return the bars
		return new Response(JSON.stringify(formattedBars), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			}
		});
	} catch (error) {
		console.error('Error fetching bars:', error);

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
