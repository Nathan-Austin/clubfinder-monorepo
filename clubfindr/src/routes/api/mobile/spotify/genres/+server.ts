// api/mobile/spotify/genres/+server.ts
// Handle Spotify genre retrieval and processing for mobile app
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';

interface DbRow {
	genres?: string[];
	preferences?: Record<string, unknown>;
	user_id?: string;
}

interface QueryResult {
	rowCount: number;
	rows: DbRow[];
}

/**
 * Get user's Spotify genres
 */
export const GET: RequestHandler = async ({ cookies }) => {
	try {
		const city = cookies.get('city') || 'berlin';
		const sessionId = cookieManager.get(cookies, 'sessionId');

		// If we have a session ID, try to fetch genres from there
		if (sessionId) {
			const sessionQuery = `
        SELECT genres FROM clubfindr.user_sessions 
        WHERE session_id = $1 AND (user_city = $2 OR user_city IS NULL);
      `;

			const sessionResult = (await pool.query(sessionQuery, [sessionId, city])) as QueryResult;

			if (sessionResult.rowCount > 0 && sessionResult.rows[0].genres) {
				return json(sessionResult.rows[0].genres);
			}
		}

		// Try to get from authenticated user if available
		const userResult = (await pool.query(
			'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1;',
			[sessionId]
		)) as QueryResult;

		const userId = userResult.rows[0]?.user_id;

		if (userId) {
			const userQuery = `
        SELECT preferences FROM clubfindr.users WHERE id = $1;
      `;

			const userPrefsResult = (await pool.query(userQuery, [userId])) as QueryResult;

			if (userPrefsResult.rowCount > 0 && userPrefsResult.rows[0].preferences) {
				const prefs = userPrefsResult.rows[0].preferences;

				// Extract genres from preferences
				if (Array.isArray(prefs)) {
					const genres = prefs
						.filter((p) => p.genre)
						.map((p) => p.genre)
						.filter(Boolean);

					if (genres.length > 0) {
						return json(genres);
					}
				}
			}
		}

		// If no genres found, return empty array
		return json([]);
	} catch (error) {
		console.error('Error fetching user genres:', error);
		return json({ success: false, message: 'Error fetching user genres' }, { status: 500 });
	}
};

/**
 * Process genres from POST request
 */
export const POST: RequestHandler = async ({ cookies, request }) => {
	try {
		const { genres } = await request.json();
		const city = cookies.get('city') || 'berlin';
		const sessionId = cookieManager.get(cookies, 'sessionId');

		if (!genres || !Array.isArray(genres) || genres.length === 0) {
			return json(
				{
					success: false,
					message: 'Invalid or empty genres array provided'
				},
				{ status: 400 }
			);
		}

		console.log(`Processing ${genres.length} genres for city: ${city}`);

		// Store genres in user session if session ID is available
		if (sessionId) {
			try {
				// Update or insert session data
				const updateQuery = `
          UPDATE clubfindr.user_sessions 
          SET genres = $1, last_accessed = CURRENT_TIMESTAMP 
          WHERE session_id = $2 AND (user_city = $3 OR user_city IS NULL)
          RETURNING id;
        `;

				const updateResult = (await pool.query(updateQuery, [
					genres,
					sessionId,
					city
				])) as QueryResult;

				// If no rows were updated, insert a new record
				if (updateResult.rowCount === 0) {
					const insertQuery = `
            INSERT INTO clubfindr.user_sessions
            (session_id, genres, user_city, created_at, last_accessed)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
          `;

					await pool.query(insertQuery, [sessionId, genres, city]);
				}

				console.log(`Genres updated for session ${sessionId} in city ${city}`);

				// Get user ID from session if available for preference updating
				const userResult = (await pool.query(
					'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1;',
					[sessionId]
				)) as QueryResult;

				const userId = userResult.rows[0]?.user_id;

				// If user is logged in, update their preferences
				if (userId) {
					try {
						// Loop through each genre and update user preferences
						for (const genre of genres) {
							const updatePreferencesQuery = `
                WITH updated_preferences AS (
                  SELECT CASE 
                    WHEN EXISTS (
                      SELECT 1 FROM jsonb_array_elements(preferences) elem
                      WHERE elem->>'genre' = $1
                    )
                    THEN (
                      SELECT jsonb_agg(
                        CASE 
                          WHEN elem->>'genre' = $1
                          THEN jsonb_set(
                            jsonb_set(elem, '{search_count}', to_jsonb((elem->>'search_count')::int + 1)),
                            '{last_searched}', to_jsonb(current_date::text)
                          )
                          ELSE elem
                        END
                      )
                      FROM jsonb_array_elements(preferences) elem
                    )
                    ELSE 
                      preferences || jsonb_build_object('genre', $1, 'search_count', 1, 'last_searched', current_date::text)
                  END AS new_preferences
                  FROM clubfindr.users
                  WHERE id = $2
                )
                UPDATE clubfindr.users
                SET preferences = (SELECT new_preferences FROM updated_preferences)
                WHERE id = $2;
              `;

							await pool.query(updatePreferencesQuery, [genre, userId]);
						}

						console.log(`Updated preferences for user ${userId}`);
					} catch (userError) {
						console.error('Error updating user preferences:', userError);
						// Continue processing even if preference update fails
					}
				}
			} catch (dbError) {
				console.error('Error updating session genres:', dbError);
				// Continue with processing even if database update fails
			}
		}

		// Set cookie for genres to make them available to other routes
		cookies.set('spotify-genres', genres.join(','), {
			path: '/',
			httpOnly: true,
			maxAge: 60 * 60 * 24 // 24 hours
		});

		// Return success response
		return json({
			success: true,
			message: 'Genres processed successfully',
			genresList: genres
		});
	} catch (error) {
		console.error('Genre processing error:', error);
		return json(
			{
				success: false,
				message: 'Internal server error processing genres',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
