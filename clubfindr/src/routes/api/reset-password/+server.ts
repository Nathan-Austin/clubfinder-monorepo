import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { hashPassword } from '$lib/server/passwordUtils';
import { hashToken } from '$lib/encryptionUtils';

export const POST: RequestHandler = async ({ request }) => {
	const { token, newPassword } = await request.json();

	if (typeof token !== 'string' || !token) {
		return json({ success: false, message: 'Invalid or expired reset token' }, { status: 400 });
	}

	try {
		// Find the password reset record (stored as a hash of the token)
		const resetResult = await query(
			`SELECT user_id, expires_at 
             FROM clubfindr.password_resets 
             WHERE reset_token = $1`,
			[hashToken(token)]
		);

		if (resetResult.rowCount === 0) {
			return json({ success: false, message: 'Invalid or expired reset token' }, { status: 400 });
		}

		const { user_id, expires_at } = resetResult.rows[0];

		// Check if token has expired
		if (new Date(expires_at) < new Date()) {
			return json({ success: false, message: 'Reset token has expired' }, { status: 400 });
		}

		// Hash the new password
		const hashedPassword = await hashPassword(newPassword);

		// Update the user's password
		await query(
			`UPDATE clubfindr.users 
             SET password_hash = $1, updated_at = NOW() 
             WHERE id = $2`,
			[hashedPassword, user_id]
		);

		// Delete the used reset token
		await query(
			`DELETE FROM clubfindr.password_resets 
             WHERE user_id = $1`,
			[user_id]
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error resetting password:', error);

		// If the error is from password validation, return the specific error
		if (error instanceof Error && error.message.includes('Password must')) {
			return json({ success: false, message: error.message }, { status: 400 });
		}

		return json({ success: false, message: 'Failed to reset password' }, { status: 500 });
	}
};
