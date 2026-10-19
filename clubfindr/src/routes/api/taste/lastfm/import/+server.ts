// POST /api/taste/lastfm/import { username, period? } -> LastfmImportResult
//
// Imports a Last.fm user's top artists into the logged-in user's favourite artists, with
// each artist's top tags mapped to genres through the existing classifier. Errors come back
// with messages meant for the screen: unknown user (404), rate limit (429), our key rejected
// or Last.fm down (502), import not configured (503).

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import { isKnownGenre } from '$lib/taste/genreClassifier';
import {
	DEFAULT_PERIOD,
	importLastfmUser,
	isLastfmPeriod,
	isValidLastfmUsername,
	LastfmError,
	type LastfmOptions
} from '$lib/taste/lastfm';

/** The value .env.example ships with; treated as "no key". */
const PLACEHOLDER_KEY = 'your-lastfm-api-key';

function lastfmOptions(): LastfmOptions | null {
	const apiKey = env.LASTFM_API_KEY?.trim();
	if (!apiKey || apiKey === PLACEHOLDER_KEY) return null;
	return { apiKey, apiBase: env.LASTFM_API_BASE || undefined };
}

export const POST: RequestHandler = async ({ cookies, request }) => {
	const userId = await getSessionUserId(cookies, pool);
	if (!userId) return json({ message: 'Not logged in' }, { status: 401 });

	let body: { username?: unknown; period?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON body' }, { status: 400 });
	}

	const username = typeof body.username === 'string' ? body.username.trim() : '';
	if (!isValidLastfmUsername(username)) {
		return json(
			{
				message:
					'That does not look like a Last.fm username (2 to 15 letters, digits, - or _, starting with a letter).'
			},
			{ status: 400 }
		);
	}
	const period = body.period === undefined ? DEFAULT_PERIOD : body.period;
	if (!isLastfmPeriod(period)) {
		return json({ message: 'Unknown period' }, { status: 400 });
	}

	const options = lastfmOptions();
	if (!options) {
		return json(
			{ message: 'The Last.fm import is not set up on this server (LASTFM_API_KEY is missing).' },
			{ status: 503 }
		);
	}

	try {
		const result = await importLastfmUser(pool, userId, username, options, {
			classify: isKnownGenre,
			period
		});
		return json(result);
	} catch (error) {
		if (error instanceof LastfmError) {
			return json({ message: error.message, code: error.code }, { status: error.status });
		}
		console.error('Last.fm import failed:', error);
		return json({ message: 'The import failed on our side. Please try again.' }, { status: 500 });
	}
};
