// POST /api/save-cookie-consent { cookiePreferences } -> stores them for the logged-in user
// GET  /api/save-cookie-consent                      -> the logged-in user's stored preferences
//
// The user comes from the session (cookie or the app's Bearer token). POST used to take a
// userId from the body, so anyone could overwrite anyone's preferences; GET read locals.user,
// which /api/* routes never get (hooks.server.ts), so it always answered 401. Nothing in the
// web app calls it today: the banner keeps its choice in localStorage.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';

const MAX_KEYS = 10;

/** A small flat object of boolean choices, e.g. { necessary: true, analytics: false }. */
function parsePreferences(value: unknown): Record<string, boolean> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const entries = Object.entries(value as Record<string, unknown>);
	if (entries.length === 0 || entries.length > MAX_KEYS) return null;
	for (const [key, choice] of entries) {
		if (!/^[a-zA-Z_]{1,30}$/.test(key) || typeof choice !== 'boolean') return null;
	}
	return Object.fromEntries(entries) as Record<string, boolean>;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await getSessionUserId(cookies, pool, request);
	if (!userId) return json({ error: 'Not logged in' }, { status: 401 });

	let body: { cookiePreferences?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
	const preferences = parsePreferences(body.cookiePreferences);
	if (!preferences) {
		return json(
			{ error: 'cookiePreferences must be an object of up to 10 boolean choices' },
			{ status: 400 }
		);
	}

	try {
		await pool.query('UPDATE clubfindr.users SET cookie_preferences = $1 WHERE id = $2', [
			JSON.stringify(preferences),
			userId
		]);
		return json({ message: 'Cookie preferences saved successfully' });
	} catch (error) {
		console.error('Failed to save cookie preferences:', error);
		return json({ error: 'Failed to save preferences' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ request, cookies }) => {
	const userId = await getSessionUserId(cookies, pool, request);
	if (!userId) return json({ error: 'Not logged in' }, { status: 401 });

	const result = await pool.query('SELECT cookie_preferences FROM clubfindr.users WHERE id = $1', [
		userId
	]);
	return json(result.rows[0]?.cookie_preferences ?? {});
};
