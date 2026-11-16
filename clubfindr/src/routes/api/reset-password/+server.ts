import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { query, withTransaction } from '$lib/db';
import { hashPassword } from '$lib/server/passwordUtils';
import { hashToken } from '$lib/encryptionUtils';

export const POST: RequestHandler = async ({ request }) => {
	const { token, newPassword } = await request.json();

	if (typeof token !== 'string' || !token) {
		return json({ success: false, message: 'Invalid or expired reset token' }, { status: 400 });
	}
	if (typeof newPassword !== 'string') {
		return json({ success: false, message: 'Please enter a new password' }, { status: 400 });
	}

	try {
		// The token belongs to a person's account (password_resets) or to a venue's own login
		// (bar_password_resets, since 2026-11-16, KNOWN_ISSUES 68); both store only its hash
		const tokenHash = hashToken(token);
		const userReset = await query(
			`SELECT user_id AS id, expires_at FROM clubfindr.password_resets WHERE reset_token = $1`,
			[tokenHash]
		);
		const barReset =
			(userReset.rowCount ?? 0) > 0
				? null
				: await query(
						`SELECT bar_id AS id, expires_at FROM clubfindr.bar_password_resets WHERE reset_token = $1`,
						[tokenHash]
					);
		const reset = userReset.rows[0] ?? barReset?.rows[0];

		if (!reset) {
			return json({ success: false, message: 'Invalid or expired reset token' }, { status: 400 });
		}

		if (new Date(reset.expires_at) < new Date()) {
			return json({ success: false, message: 'Reset token has expired' }, { status: 400 });
		}

		// Validates the password's rules too ("Password must ...", answered below)
		const hashedPassword = await hashPassword(newPassword);

		if (barReset) {
			await withTransaction(async (client) => {
				await client.query(
					`UPDATE clubfindr.bars SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
					[hashedPassword, reset.id]
				);
				await client.query(`DELETE FROM clubfindr.bar_password_resets WHERE bar_id = $1`, [
					reset.id
				]);
				// A reset is often the answer to a login someone else knows: end the venue's
				// dashboard and app sessions so the old password's sessions stop working
				await client.query(`DELETE FROM clubfindr.bar_sessions WHERE bar_id = $1`, [reset.id]);
			});
			return json({ success: true, account: 'venue' });
		}

		await query(
			`UPDATE clubfindr.users
			 SET password_hash = $1, updated_at = NOW()
			 WHERE id = $2`,
			[hashedPassword, reset.id]
		);

		// Delete the used reset token
		await query(`DELETE FROM clubfindr.password_resets WHERE user_id = $1`, [reset.id]);

		return json({ success: true, account: 'user' });
	} catch (error) {
		console.error('Error resetting password:', error);

		// If the error is from password validation, return the specific error
		if (error instanceof Error && error.message.includes('Password must')) {
			return json({ success: false, message: error.message }, { status: 400 });
		}

		return json({ success: false, message: 'Failed to reset password' }, { status: 500 });
	}
};
