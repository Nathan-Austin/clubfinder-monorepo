// POST { selectedIds } -> { genresList }: the genres of the artists picked on the guest search
// (/spotify/search), kept in the visitor's `spotify-genres` cookie for /selectedGenres, /clubs
// and /barfindr; GET reads that cookie back. Looks the artists up with the app's
// client-credentials token ($lib/taste/spotifyArtistLookup), never a user's Spotify login.

import { json as svelteJson } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';
import { isSpotifyId, spotifyAppGet, SpotifyLookupError } from '$lib/taste/spotifyArtistLookup';
import { spotifyLookupOptions } from '$lib/taste/spotifyOptions';

// Spotify's several-artists endpoint takes at most 50 ids
const MAX_IDS = 50;
const artistsPath = (ids: string[]) => `/v1/artists?${new URLSearchParams({ ids: ids.join(',') })}`;

// The genres of the caller's last POST, carried per visitor in this cookie (a module-level
// variable here returned whichever user's genres were fetched last, to everyone)
const GENRES_COOKIE = 'spotify-genres';
const GENRES_COOKIE_MAX_AGE = 60 * 60 * 24;

export const GET: RequestHandler = async ({ cookies }) => {
	const stored = cookies.get(GENRES_COOKIE);
	const genresList = stored ? stored.split(',').filter((genre) => genre.length > 0) : [];
	return svelteJson({ genresList });
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

		// Only Spotify-shaped ids go into the request URL; duplicates removed, at most 50
		const uniqueIds = [...new Set(processedIds.filter(isSpotifyId))].slice(0, MAX_IDS);
		if (uniqueIds.length === 0) {
			return svelteJson({ message: 'No valid IDs provided' }, { status: 400 });
		}

		// Initialize genre set
		const genresList: Set<string> = new Set();
		const normalizeGenre = (genre: string) => genre.toLowerCase().trim();

		// Fetch artist data from Spotify
		let data: { artists?: ({ genres?: unknown } | null)[] };
		try {
			data = (await spotifyAppGet(artistsPath(uniqueIds), spotifyLookupOptions())) as typeof data;
		} catch (error) {
			console.warn('Spotify artist lookup failed:', error);
			const status = error instanceof SpotifyLookupError ? error.status : 500;
			return svelteJson({ message: 'Spotify is unavailable right now' }, { status });
		}

		if (!Array.isArray(data.artists)) {
			return svelteJson({ message: 'Invalid response from Spotify API' }, { status: 502 });
		}

		// Process genres (Spotify answers null for an unknown id, and often no genres at all)
		for (const artist of data.artists) {
			const genres = Array.isArray(artist?.genres) ? artist.genres : [];
			for (const genre of genres) {
				if (typeof genre === 'string' && genre.trim()) genresList.add(normalizeGenre(genre));
			}
		}

		const genresArray = Array.from(genresList);
		cookies.set(GENRES_COOKIE, genresArray.join(','), {
			path: '/',
			maxAge: GENRES_COOKIE_MAX_AGE
		});

		// Handle user session if not a search-only request
		const searchCookie = cookies.get('search');
		if (!searchCookie) {
			const sessionId = cookieManager.get(cookies, 'sessionId');
			let city = cookies.get('city');
			const date = cookies.get('date');

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
