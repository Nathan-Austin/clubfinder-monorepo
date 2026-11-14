import { json } from '@sveltejs/kit';
import { pool, query } from '$lib/db';
import { CODE_ATTEMPTS_EXHAUSTED, spendCodeAttempt } from '$lib/server/codeAttempts';
import {
	confirmationCode as codeCheck,
	email as emailCheck,
	fields,
	readJsonObject
} from '$lib/server/validate';

export async function POST({ request }) {
	try {
		// Checked before any query, so a malformed guess never spends an attempt (ROADMAP
		// section 4)
		const body = await readJsonObject(request);
		const input = fields({
			email: emailCheck(body?.email),
			confirmationCode: codeCheck(body?.confirmationCode)
		});
		if (!input.ok) return json({ success: false, message: input.message }, { status: 400 });
		const { email, confirmationCode } = input.value;

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

		// Check if the confirmation code is valid
		if (!confirmation_code || String(confirmation_code).toUpperCase() !== confirmationCode) {
			return json({ success: false, message: 'Invalid confirmation code' }, { status: 400 });
		}

		// Check if the confirmation code has expired
		if (!expires_at || new Date() > new Date(expires_at as string | Date)) {
			return json({ success: false, message: 'Confirmation code has expired' }, { status: 400 });
		}

		// Clear the confirmation code and mark email as confirmed
		await query(
			`UPDATE clubfindr.users SET confirmation_code = NULL, confirmed = TRUE, confirmation_attempts = 0
			 WHERE LOWER(general_email) = LOWER($1)`,
			[email]
		);

		return json({ success: true, message: 'Email verified successfully!' });
	} catch (error) {
		console.error('Error verifying email:', error);
		return json({ success: false, message: 'An unexpected error occurred' }, { status: 500 });
	}
}
