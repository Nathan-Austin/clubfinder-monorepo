import { json as svelteJson } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';

export const POST: RequestHandler = async ({ cookies, request }) => {
	try {
		const selections = await request.json();

		if (!Array.isArray(selections) || selections.length === 0) {
			return svelteJson({ message: 'No selections provided' }, { status: 400 });
		}

		const genresList: Set<string> = new Set();
		const normalizeGenre = (genre: string) => genre.toLowerCase().trim();

		selections.forEach((item) => {
			const data = item.data;
			if (!data) return;

			// Handle both flat objects (Spotify/SoundCloud) and Tidal's nested attributes
			const attributes = data.attributes || data;

			console.log(
				`[Analyze] Processing ${item.type}: ${
					attributes.username || attributes.name || attributes.title
				}`
			);
			console.log(`[Analyze] Data keys available:`, Object.keys(data));

			// SoundCloud specific: check for 'genre' and 'tag_list'
			// Tidal also uses 'genre' or 'genres' in attributes
			const genreSource = attributes.genre || attributes.genres;
			if (genreSource) {
				const genres = Array.isArray(genreSource) ? genreSource : [genreSource];
				genres.forEach((g: string | { name: string }) => {
					// Tidal genres can be objects with 'name'
					const genreName = typeof g === 'object' ? g.name : String(g);
					if (genreName) genresList.add(normalizeGenre(genreName.replace(/["]/g, '')));
				});
			}

			// SoundCloud stores many tags in 'tag_list' (quoted for multi-word)
			const tagSource = attributes.tag_list || attributes.tags;
			if (tagSource && typeof tagSource === 'string') {
				// Regex to match words or words inside quotes
				const tags = tagSource.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
				tags.forEach((tag: string) => {
					const cleanTag = tag.replace(/["]/g, '');
					const normalized = normalizeGenre(cleanTag);
					if (normalized.length > 2 && !normalized.includes('soundcloud:')) {
						genresList.add(normalized);
					}
				});
			}

			// If it's an artist and we have their description, try to extract genres from there too
			if (data.description) {
				const commonGenres = [
					'techno',
					'house',
					'disco',
					'ambient',
					'trance',
					'hip hop',
					'rap',
					'r&b',
					'soul',
					'jazz',
					'rock',
					'metal',
					'edm',
					'dubstep',
					'drum and bass',
					'dnb',
					'jungle',
					'hardstyle',
					'psytrance',
					'minimal',
					'lo-fi',
					'phonk'
				];
				const desc = data.description.toLowerCase();
				commonGenres.forEach((g) => {
					// Use word boundaries to avoid matching 'house' in 'household'
					const regex = new RegExp(`\\b${g}\\b`, 'i');
					if (regex.test(desc)) genresList.add(g);
				});
			}
		});

		const genresArray = Array.from(genresList);

		console.log('--- Model Input Analysis ---');
		console.log('Selections Count:', selections.length);
		console.log('Extracted Genres:', genresArray);
		console.log('---------------------------');

		// Handle user session / preferences (similar to Spotify logic)
		const sessionId = cookieManager.get(cookies, 'sessionId');
		let city = cookies.get('city');

		if (sessionId && city) {
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

		return svelteJson({
			success: true,
			genresList: genresArray
		});
	} catch (error) {
		console.error('Error handling analyze-selections:', error);
		return svelteJson({ message: 'Error processing selections' }, { status: 500 });
	}
};
