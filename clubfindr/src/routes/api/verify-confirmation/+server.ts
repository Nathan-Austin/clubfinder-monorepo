// api/verify-confirmation/+server.ts
// recieives a POST request with the email and confirmation code from the mobile app

import { json } from '@sveltejs/kit';
import { pool, query } from '$lib/db';
import { CODE_ATTEMPTS_EXHAUSTED, spendCodeAttempt } from '$lib/server/codeAttempts';
import {
	SAY,
	confirmationCode as codeCheck,
	email as emailCheck,
	fields,
	readJsonObject
} from '$lib/server/validate';

// It used to log the e-mail, the code the caller sent and the row holding the real one on every
// call; it logs none of that now.
export async function POST({ request }) {
	// Checked before any query, so a malformed guess never spends an attempt (ROADMAP section 4)
	const body = await readJsonObject(request);
	const input = fields({
		email: emailCheck(body?.email),
		confirmationCode: codeCheck(body?.confirmationCode)
	});
	if (!input.ok) return json({ success: false, message: SAY.code }, { status: 400 });
	const { email, confirmationCode } = input.value;
	try {
		// Every guess spends one of the code's attempts, in the statement that reads it
		// (KNOWN_ISSUES 55)
		const attempt = await spendCodeAttempt(pool, 'users', email, [
			'confirmation_code',
			'expires_at'
		]);
		if (attempt.outcome === 'exhausted') {
			return json({ success: false, message: CODE_ATTEMPTS_EXHAUSTED }, { status: 429 });
		}
		if (attempt.outcome === 'not_found') {
			return json({ success: false, message: 'User not found' }, { status: 404 });
		}

		const { confirmation_code, expires_at } = attempt.row;

		if (!confirmation_code || String(confirmation_code).toUpperCase() !== confirmationCode) {
			return json({ success: false, message: 'Invalid confirmation code' }, { status: 400 });
		}

		if (!expires_at || new Date() > new Date(expires_at as string | Date)) {
			return json({ success: false, message: 'Confirmation code has expired' }, { status: 400 });
		}

		// Clear the confirmation code after successful validation
		await query(
			`UPDATE clubfindr.users SET confirmation_code = NULL, confirmed = TRUE, confirmation_attempts = 0
			 WHERE LOWER(general_email) = LOWER($1)`,
			[email]
		);
		return json({ success: true, message: 'Email confirmed successfully!' });
	} catch (error) {
		console.error('Error verifying confirmation code:', error);
		return json({ success: false, message: 'An unexpected error occurred' }, { status: 500 });
	}
}
