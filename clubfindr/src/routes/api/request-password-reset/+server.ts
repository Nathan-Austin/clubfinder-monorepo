import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { sendEmail } from '$lib/email';
import { randomBytes } from 'crypto';
import { hashToken } from '$lib/encryptionUtils';

export const POST: RequestHandler = async ({ request, url }) => {
	const { email } = await request.json();

	try {
		// Generate a secure reset token
		const resetToken = randomBytes(32).toString('hex');
		const tokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

		// Check if user exists
		const userResult = await query('SELECT id FROM clubfindr.users WHERE general_email = $1', [
			email
		]);

		// Always return success even if email doesn't exist (security best practice)
		if (userResult.rowCount === 0) {
			return json({ success: true });
		}

		const userId = userResult.rows[0].id;

		// Store only a hash of the token; the e-mailed link carries the token itself
		await query(
			`INSERT INTO clubfindr.password_resets (user_id, reset_token, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) 
             DO UPDATE SET reset_token = $2, expires_at = $3, updated_at = NOW()`,
			[userId, hashToken(resetToken), tokenExpiry]
		);

		// Send password reset email
		// The site the request came from (ORIGIN in production), so the token matches the deployment
		const resetLink = `${url.origin}/password-reset/${resetToken}`;
		await sendEmail(
			email,
			'Password Reset Request',
			`You have requested to reset your password. Click the link below to set a new password:
            
            ${resetLink}
            
            This link will expire in 30 minutes.
            
            If you did not request this password reset, please ignore this email.`
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error processing password reset request:', error);
		return json(
			{ success: false, message: 'Failed to process password reset request' },
			{ status: 500 }
		);
	}
};
