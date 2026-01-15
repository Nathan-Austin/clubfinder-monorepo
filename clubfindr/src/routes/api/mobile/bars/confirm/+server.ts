// routes/api/mobile/bars/confirm/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';
import { sendEmail } from '$lib/email';
import { generateJWT } from '$lib/authUtils';

export const POST: RequestHandler = async ({ request }) => {
	const { email, confirmationCode } = await request.json();

	try {
		// Validate the email and confirmation code
		const result = await query(
			`SELECT id, name, expires_at 
			 FROM clubfindr.bars 
			 WHERE general_email = $1 AND confirmation_code = $2`,
			[email, confirmationCode]
		);

		if (result.rows.length === 0) {
			return json(
				{
					success: false,
					error: 'Invalid confirmation code or email'
				},
				{ status: 400 }
			);
		}

		const barData = result.rows[0];
		const expiresAt = new Date(barData.expires_at);
		const now = new Date();

		// Check if the confirmation code has expired
		if (expiresAt < now) {
			return json(
				{
					success: false,
					error: 'Confirmation code has expired'
				},
				{ status: 400 }
			);
		}

		// Mark the bar as confirmed
		await query(
			`UPDATE clubfindr.bars 
			 SET confirmed = true, 
			     confirmation_code = NULL, 
			     expires_at = NULL,
			     updated_at = NOW()
			 WHERE id = $1`,
			[barData.id]
		);

		// Update user record to confirmed status
		await query(
			`UPDATE clubfindr.users u
			 SET confirmed = true, updated_at = NOW()
			 FROM clubfindr.bars b
			 WHERE b.id = $1 AND u.id = b.user_id`,
			[barData.id]
		);

		// Generate a JWT token for auto-login
		const token = generateJWT({
			userId: barData.id,
			email: email,
			role: 'bar',
			type: 'mobile'
		});

		// Send welcome email
		await sendEmail(
			email,
			'Welcome to ClubFindr - Registration Complete',
			`Congratulations! Your bar "${barData.name}" has been successfully registered with ClubFindr.
			
You can now log in to your bar management dashboard to:
- Update your bar profile
- Create special events
- Generate QR codes for customer check-ins
- Connect your Spotify account
- View customer analytics
			
Thank you for joining the ClubFindr network!`
		);

		// Return success with token for auto-login
		return json({
			success: true,
			barData: {
				id: barData.id,
				name: barData.name,
				email: email
			},
			token
		});
	} catch (error) {
		console.error('Error confirming bar registration:', error);
		return json(
			{
				success: false,
				error: 'Failed to confirm registration'
			},
			{ status: 500 }
		);
	}
};
