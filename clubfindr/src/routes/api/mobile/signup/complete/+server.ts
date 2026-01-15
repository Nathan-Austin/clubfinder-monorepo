// api/mobile/signup/complete/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { onboarding_complete, userId } = body;

		if (typeof onboarding_complete !== 'boolean' || !userId) {
			return json({ error: 'Invalid request payload' }, { status: 400 });
		}

		// Update the database
		const result = await query(
			`
            UPDATE clubfindr.users
            SET onboarding_complete = $1, is_first_time = $2
            WHERE id = $3
            RETURNING spotify_app_name, onboarding_complete
            `,
			[onboarding_complete, false, userId]
		);

		if (!result || result.rowCount === 0) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const { spotify_app_name } = result.rows[0];

		if (spotify_app_name !== 'pending') {
			return json({ message: 'Sign up complete' });
		}

		return json({ message: 'Onboarding updated successfully' });
	} catch (error) {
		console.error('Error updating onboarding:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
