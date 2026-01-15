// api/send-delete-confirmation-code/+server.ts

import { json, error } from '@sveltejs/kit';
import { query } from '$lib/db';
import { randomBytes } from 'crypto';
import { sendEmail } from '$lib/email';

// Email validation utility function
function validateEmail(email: string) {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export async function POST({ request }) {
	const { email } = await request.json();

	// Validate the email format
	if (!email || !validateEmail(email)) {
		throw error(400, 'Invalid email format');
	}

	// Generate a random confirmation code
	const confirmationCode = randomBytes(3).toString('hex').toUpperCase();
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // Expiry in 10 minutes

	try {
		// Begin a database transaction
		await query('BEGIN');

		// Update the user with the confirmation code and set an expiry time
		const result = await query(
			`UPDATE clubfindr.users 
			 SET confirmation_code = $1, expires_at = $2
			 WHERE general_email = $3 OR spotify_email = $3
			 RETURNING id`,
			[confirmationCode, expiresAt, email]
		);

		// If no user was found with that email
		if (result.rows.length === 0) {
			await query('ROLLBACK');
			return json({ success: false, message: 'Email not found' }, { status: 404 });
		}

		// Commit the transaction
		await query('COMMIT');

		// Send the confirmation code via email
		await sendEmail(
			email,
			'Confirmation Code for Data Deletion',
			`Your confirmation code is ${confirmationCode}. This code will expire in 10 minutes.`
		);

		return json({
			success: true,
			message: 'Confirmation code sent to your email.'
		});
	} catch (err) {
		// Rollback the transaction in case of failure
		await query('ROLLBACK');
		console.error('Failed to send confirmation code:', err);
		throw error(500, 'Failed to send confirmation code');
	}
}
