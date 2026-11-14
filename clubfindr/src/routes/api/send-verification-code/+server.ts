// This file is a SvelteKit endpoint that handles sending verification codes to users.
// 	This is called form the mobile app when a user requests to verify their email or delete their account.

import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import { generateConfirmationCode } from '$lib/codegen.js';
import { sendVerificationEmail, sendDeletionConfirmationEmail } from '$lib/email';
import { SAY, email as emailCheck, oneOf, readJsonObject } from '$lib/server/validate';

const PURPOSES = ['email_verification', 'account_deletion'] as const;

export async function POST({ request }) {
	try {
		// Checked before any query (ROADMAP section 4). A missing purpose still means e-mail
		// verification, as before; one that is neither of the two is refused instead of being
		// quietly treated as verification.
		const body = await readJsonObject(request);
		const checkedEmail = emailCheck(body?.email);
		if (!checkedEmail.ok) return json({ success: false, message: SAY.email }, { status: 400 });
		// A wrong purpose is the app's mistake, not the person's: that message names the field
		const checkedPurpose = oneOf(body?.purpose, 'purpose', PURPOSES, 'email_verification');
		if (!checkedPurpose.ok) {
			return json({ success: false, message: checkedPurpose.message }, { status: 400 });
		}
		const email = checkedEmail.value;
		const purpose = checkedPurpose.value;
		console.log(`Sending ${purpose} code to: ${email}`);

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
             SET confirmation_code = $1, expires_at = $2, confirmation_attempts = 0
             WHERE id = $3`,
			[confirmationCode, expiresAt, userId]
		);

		// Send email based on purpose
		if (purpose === 'account_deletion') {
			await sendDeletionConfirmationEmail(email, confirmationCode);
		} else {
			await sendVerificationEmail(email, confirmationCode);
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error sending verification code:', error);
		return json({ success: false, message: 'Failed to send verification code' }, { status: 500 });
	}
}
