// routes/api/mobile/bars/confirm/+server.ts
import { json } from '@sveltejs/kit';
import { pool, query } from '$lib/db';
import type { RequestHandler } from './$types';
import { sendEmail } from '$lib/email';
import { generateJWT } from '$lib/authUtils';
import { BAR_CODE_SECONDS_LEFT_SQL, barCodeStillValid } from '$lib/server/barCodeExpiry';
import { CODE_ATTEMPTS_EXHAUSTED, spendCodeAttempt } from '$lib/server/codeAttempts';
import {
	confirmationCode as codeCheck,
	email as emailCheck,
	fields,
	readJsonObject
} from '$lib/server/validate';

export const POST: RequestHandler = async ({ request }) => {
	// Checked before any query, so a malformed guess never spends an attempt (ROADMAP section 4)
	const body = await readJsonObject(request);
	const input = fields({
		email: emailCheck(body?.email),
		confirmationCode: codeCheck(body?.confirmationCode)
	});
	if (!input.ok) return json({ success: false, error: input.message }, { status: 400 });
	const { email, confirmationCode } = input.value;

	try {
		// Every guess spends one of the code's attempts, in the statement that reads it
		// (KNOWN_ISSUES 55); the code is compared here rather than in the WHERE clause so a
		// wrong guess still counts
		const attempt = await spendCodeAttempt(pool, 'bars', email, [
			'id',
			'name',
			'confirmation_code',
			`${BAR_CODE_SECONDS_LEFT_SQL} AS seconds_left`
		]);
		if (attempt.outcome === 'exhausted') {
			return json({ success: false, error: CODE_ATTEMPTS_EXHAUSTED }, { status: 429 });
		}
		if (
			attempt.outcome === 'not_found' ||
			!attempt.row.confirmation_code ||
			attempt.row.confirmation_code !== confirmationCode
		) {
			return json(
				{
					success: false,
					error: 'Invalid confirmation code or email'
				},
				{ status: 400 }
			);
		}

		const barData = attempt.row as { id: string; name: string; seconds_left: number | null };
		// Check if the confirmation code has expired
		if (!barCodeStillValid(barData.seconds_left)) {
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
			     confirmation_attempts = 0,
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
