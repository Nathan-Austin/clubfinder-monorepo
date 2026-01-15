//register/promoter/confirm/+sever.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';
import { normalizeCityName } from '$lib/spotifyUtils';
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, confirmationCode } = await request.json();

		// Fetch the city and table name from user_bars table based on the user's email
		const cityResult = await query(`SELECT city FROM clubfindr.users WHERE general_email = $1`, [
			email
		]);

		if (cityResult.rows.length === 0) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const normalizedCityName = normalizeCityName(cityResult.rows[0].city);

		const result = await query(
			`SELECT confirmation_code, expires_at FROM clubfindr.bars WHERE general_email = $1 AND city = $2`,
			[email, normalizedCityName]
		);

		if (result.rows.length === 0) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const { confirmation_code, expires_at } = result.rows[0];

		// Check if the confirmation code has expired
		if (new Date() > new Date(expires_at)) {
			return json({ error: 'Confirmation code expired' }, { status: 400 });
		}

		// Validate the provided confirmation code
		if (confirmation_code !== confirmationCode) {
			return json({ error: 'Invalid confirmation code' }, { status: 400 });
		}

		await query(
			`UPDATE clubfindr.bars SET confirmed = true  WHERE general_email = $1 AND city = $2`,
			[email, normalizedCityName]
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error in confirm handler:', error);
		return json({ error: 'An unexpected error occurred' }, { status: 500 });
	}
};
