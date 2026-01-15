// Modified version of /routes/api/spotify/artists/+server.ts

import { json as svelteJson } from '@sveltejs/kit';
import { withAccessToken } from '$lib/spotifyUtils';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';

const artistsEndpoint = (ids: string[]) =>
	`https://api.spotify.com/v1/artists?ids=${ids.join(',')}`;

// Store genres temporarily in memory
let lastFetchedGenres: string[] = [];

export const GET: RequestHandler = async () => {
	return svelteJson({ genresList: lastFetchedGenres });
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Allow-Origin': '*'
		}
	});
};

export const POST: RequestHandler = async ({ cookies, request }) => {
	try {
		const { selectedIds } = await request.json();

		// Ensure selectedIds is properly formatted
		let processedIds: string[];

		if (Array.isArray(selectedIds) && selectedIds.length > 0) {
			// Handle nested arrays (from /spotify page)
			if (Array.isArray(selectedIds[0])) {
				processedIds = selectedIds.flat();
			} else {
				// Handle flat arrays (from /spotify/search page)
				processedIds = selectedIds;
			}
		} else {
			return svelteJson({ message: 'No valid IDs provided' }, { status: 400 });
		}

		// Remove duplicates and limit to 50 IDs
		const uniqueIds = [...new Set(processedIds)].slice(0, 50);

		// Initialize genre set
		const genresList: Set<string> = new Set();
		const normalizeGenre = (genre: string) => genre.toLowerCase().trim();

		// Fetch artist data from Spotify
		const data = await withAccessToken({
			cookies,
			endpoint: artistsEndpoint(uniqueIds)
		});

		if (!data.artists) {
			return svelteJson({ message: 'Invalid response from Spotify API' }, { status: 500 });
		}

		// Process genres
		data.artists.forEach((artist: { genres: string[] }) => {
			artist.genres.forEach((genre: string) => {
				genresList.add(normalizeGenre(genre));
			});
		});

		const genresArray = Array.from(genresList);
		lastFetchedGenres = genresArray;

		// Handle user session if not a search-only request
		const searchCookie = cookies.get('search');
		if (!searchCookie) {
			const sessionId = cookieManager.get(cookies, 'sessionId');
			let city = cookies.get('city');
			const date = cookies.get('date');
			console.log(city, date, sessionId);

			if (sessionId && city && date) {
				city = city.toLowerCase();

				// Update session data
				const updateSessionQuery = `
                    UPDATE clubfindr.user_sessions 
                    SET genres = $1, last_accessed = CURRENT_TIMESTAMP 
                    WHERE session_id = $2 AND user_city = $3;
                `;
				await pool.query(updateSessionQuery, [genresArray, sessionId, city]);

				// Update user preferences if logged in
				const userResult = await pool.query(
					'SELECT user_id FROM clubfindr.user_sessions WHERE session_id = $1;',
					[sessionId]
				);

				if (userResult.rows[0]?.user_id) {
					const userId = userResult.rows[0].user_id;
					for (const genre of genresArray) {
						await pool.query(
							`
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
                        `,
							[genre, userId]
						);
					}
				}
			}
		} else {
			// Handle search-only case
			cookies.set('genre', genresArray.join(','), {
				path: '/',
				maxAge: 3600
			});
		}

		return svelteJson({
			success: true,
			genresList: genresArray
		});
	} catch (error) {
		console.error('Error handling POST request:', error);
		return svelteJson({ message: 'Error processing request' }, { status: 500 });
	}
};
