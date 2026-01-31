// routes/api/mobile/bars/resend-code/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import { randomBytes } from 'crypto';
import type { RequestHandler } from './$types';
import { sendEmail } from '$lib/email';

export const POST: RequestHandler = async ({ request }) => {
	const { email } = await request.json();

	try {
		// Check if the bar exists
		const barResult = await query(
			`SELECT id, name 
			 FROM clubfindr.bars 
			 WHERE general_email = $1`,
			[email]
		);

		if (barResult.rows.length === 0) {
			return json(
				{
					success: false,
					error: 'No registration found for this email'
				},
				{ status: 404 }
			);
		}

		const barData = barResult.rows[0];

		// Check if already confirmed
		const confirmedResult = await query(`SELECT confirmed FROM clubfindr.bars WHERE id = $1`, [
			barData.id
		]);

		if (confirmedResult.rows[0].confirmed) {
			return json(
				{
					success: false,
					error: 'This registration is already confirmed'
				},
				{ status: 400 }
			);
		}

		// Generate a new confirmation code
		const confirmationCode = randomBytes(3).toString('hex').toUpperCase();
		const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

		// Update the bar record with new code
		await query(
			`UPDATE clubfindr.bars 
			 SET confirmation_code = $1, 
				 expires_at = $2, 
				 updated_at = NOW()
			 WHERE id = $3`,
			[confirmationCode, expiresAt, barData.id]
		);

		// Send the new confirmation code
		const confirmationLink = `https://clubfindr.com/confirm-bar?email=${encodeURIComponent(
			email
		)}&code=${confirmationCode}`;
		await sendEmail(
			email,
			'New Confirmation Code',
			`Hello from ClubFindr!

A new confirmation code has been requested for your bar registration.
Your new confirmation code is: ${confirmationCode}

Click the link below to confirm your registration:
${confirmationLink}

Or enter the code manually in the Tilki app.
This code will expire in 30 minutes.

If you did not request this code, please ignore this email.`
		);

		return json({
			success: true,
			message: 'A new confirmation code has been sent to your email'
		});
	} catch (error) {
		console.error('Error resending confirmation code:', error);
		return json(
			{
				success: false,
				error: 'Failed to resend confirmation code'
			},
			{ status: 500 }
		);
	}
};
