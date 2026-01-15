// src/routes/api/save-cookie-consent/+server.js
import { json } from '@sveltejs/kit';
import { query } from '$lib/db'; // Assuming you're using some database handler

export async function POST({ request }) {
	const { userId, cookiePreferences } = await request.json();

	// Ensure that userId is provided (if logged-in user)
	if (!userId) {
		return json({ error: 'User not logged in' }, { status: 401 });
	}

	try {
		await query('UPDATE clubfindr.users SET cookie_preferences = $1 WHERE id = $2', [
			cookiePreferences,
			userId
		]);
		return json({ message: 'Cookie preferences saved successfully' });
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
	} catch (error) {
		return json({ error: 'Failed to save preferences' }, { status: 500 });
	}
}
// src/routes/api/get-cookie-preferences/+server.js
export async function GET({ locals }) {
	const userId = locals.user?.id;

	if (userId) {
		const result = await query('SELECT cookie_preferences FROM clubfindr.users WHERE id = $1', [
			userId
		]);
		return new Response(JSON.stringify(result.rows[0].cookie_preferences), { status: 200 });
	}

	return new Response(JSON.stringify({}), { status: 401 });
}
