//register/promoter/confirm/resend-code/+server.ts

import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import { sendEmail } from '$lib/email';
import { randomBytes } from 'crypto';
import type { RequestHandler } from '@sveltejs/kit';
import { normalizeCityName } from '$lib/spotifyUtils';

export const POST: RequestHandler = async ({ request }) => {
	const { email } = await request.json();
	const cityResult = await query(`SELECT city FROM users WHERE general_email = $1`, [email]);

	if (!cityResult.rows.length) {
		return json({ success: false, error: 'User not found' }, { status: 404 });
	}
	const normalizedCityName = normalizeCityName(cityResult.rows[0].city);

	try {
		// Query the bars table, filtering by email and city
		const result = await query(
			`SELECT resend_attempts, expires_at FROM clubfindr.bars WHERE general_email = $1 AND city =$2`,
			[email, normalizedCityName]
		);
		const user = result.rows[0];

		if (!user) {
			return json({ success: false, error: 'User not found' }, { status: 404 });
		}

		const { resend_attempts, expires_at } = user;

		// Check if resend attempts exceed the limit
		if (resend_attempts >= 3) {
			return json({ success: false, error: 'Maximum resend attempts reached' }, { status: 429 });
		}

		// Calculate the time left before the current confirmation code expires
		const currentTime = new Date();
		const expiresAt = new Date(expires_at);
		const timeLeft = (expiresAt.getTime() - currentTime.getTime()) / 1000;

		if (timeLeft > 0) {
			return json(
				{
					success: false,
					error: `Please wait ${Math.ceil(timeLeft / 60)} minutes before resending`
				},
				{ status: 429 }
			);
		}

		// Generate a new confirmation code
		const confirmationCode = randomBytes(3).toString('hex').toUpperCase();
		const newExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

		// Update the confirmation code and resend attempts
		await query(
			`UPDATE bars SET confirmation_code = $1, expires_at = $2, resend_attempts = resend_attempts + 1 WHERE general_email = $3 AND city = $4`,
			[confirmationCode, newExpiresAt, email, normalizedCityName]
		);

		// Send the new confirmation code via email
		await sendEmail(
			email,
			'Your New Confirmation Code',
			`Your new confirmation code is ${confirmationCode}. It will expire in 10 minutes.`
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error resending confirmation code:', error);
		return json({ success: false, error: 'Failed to resend confirmation code' }, { status: 500 });
	}
};
