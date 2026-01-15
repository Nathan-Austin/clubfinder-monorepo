import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import { sendEmail } from '$lib/email';
import { randomBytes } from 'crypto';
import type { RequestHandler } from '@sveltejs/kit';
import { normalizeCityName } from '$lib/spotifyUtils';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email } = await request.json();
		console.log('Resend confirmation request received for email:', email);

		const normalizedEmail = email.trim().toLowerCase();

		// Query the bars table directly without dependency on the users table
		console.log('Querying bars table for user information');
		const result = await query(
			`SELECT resend_attempts, expires_at, city FROM clubfindr.bars WHERE LOWER(general_email) = LOWER($1)`,
			[normalizedEmail]
		);
		console.log('Bars query result rows:', result.rows.length);

		if (result.rows.length === 0) {
			console.log('No bar found with email:', normalizedEmail);
			return json(
				{
					success: false,
					error:
						'Bar registration not found. Please ensure you have started the registration process.'
				},
				{ status: 404 }
			);
		}

		const user = result.rows[0];
		const { resend_attempts, expires_at, city } = user;
		console.log(
			'Found bar with resend_attempts:',
			resend_attempts,
			'expires_at:',
			expires_at,
			'city:',
			city
		);

		// Check if resend attempts exceed the limit
		if (resend_attempts >= 3) {
			console.log('Maximum resend attempts reached for email:', normalizedEmail);
			return json(
				{
					success: false,
					error: 'Maximum resend attempts reached. Please contact support for assistance.'
				},
				{ status: 429 }
			);
		}

		// Calculate the time left before the current confirmation code expires
		const currentTime = new Date();
		const expiresAt = new Date(expires_at);
		const timeLeft = (expiresAt.getTime() - currentTime.getTime()) / 1000;
		console.log('Time left before expiration (seconds):', timeLeft);

		if (timeLeft > 0) {
			const minutesLeft = Math.ceil(timeLeft / 60);
			console.log('Confirmation code still valid. Minutes left:', minutesLeft);
			return json(
				{
					success: false,
					error: `Please wait ${minutesLeft} minute${
						minutesLeft === 1 ? '' : 's'
					} before requesting a new code.`
				},
				{ status: 429 }
			);
		}

		// Generate a new confirmation code
		const confirmationCode = randomBytes(3).toString('hex').toUpperCase();
		const newExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
		console.log('Generated new confirmation code:', confirmationCode, 'expires at:', newExpiresAt);

		// Update the confirmation code and resend attempts
		console.log('Updating confirmation code in database');
		await query(
			`UPDATE clubfindr.bars SET confirmation_code = $1, expires_at = $2, resend_attempts = resend_attempts + 1 WHERE LOWER(general_email) = LOWER($3) AND city = $4`,
			[confirmationCode, newExpiresAt, normalizedEmail, city]
		);

		// Send the new confirmation code via email
		console.log('Sending confirmation email');
		await sendEmail(
			normalizedEmail,
			'Your New ClubFindr Confirmation Code',
			`Your new confirmation code is ${confirmationCode}. It will expire in 10 minutes.`
		);
		console.log('Email sent successfully');

		return json({ success: true });
	} catch (error) {
		console.error('Error resending confirmation code:', error);
		return json(
			{
				success: false,
				error: 'An unexpected error occurred. Please try again or contact support.'
			},
			{ status: 500 }
		);
	}
};
