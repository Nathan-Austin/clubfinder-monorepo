import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import { generateConfirmationCode } from '$lib/codegen.js';
import { sendVerificationEmail } from '$lib/email';

export async function POST({ request }) {
	try {
		const { email } = await request.json();
		console.log(`Resending verification code to: ${email}`);

		// Find user by email
		const userResult = await query('SELECT id FROM clubfindr.users WHERE general_email = $1', [
			email
		]);

		if (userResult.rows.length === 0) {
			return json({ success: false, message: 'Email not found' }, { status: 404 });
		}

		const userId = userResult.rows[0].id;

		// Generate new code
		const confirmationCode = generateConfirmationCode();
		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + 1); // Expire in 1 hour

		// Update user with new code
		await query(
			`UPDATE clubfindr.users 
             SET confirmation_code = $1, expires_at = $2 
             WHERE id = $3`,
			[confirmationCode, expiresAt, userId]
		);

		// Send email
		await sendVerificationEmail(email, confirmationCode);

		return json({ success: true, message: 'Verification code resent' });
	} catch (error) {
		console.error('Error resending verification code:', error);
		return json({ success: false, message: 'Failed to resend verification code' }, { status: 500 });
	}
}
