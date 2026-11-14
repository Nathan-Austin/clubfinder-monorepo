//register/promoter/confirm/+sever.ts
import { json } from '@sveltejs/kit';
import { pool, query } from '$lib/db';
import type { RequestHandler } from './$types';
import { BAR_CODE_SECONDS_LEFT_SQL, barCodeStillValid } from '$lib/server/barCodeExpiry';
import { CODE_ATTEMPTS_EXHAUSTED, spendCodeAttempt } from '$lib/server/codeAttempts';
import {
	SAY,
	confirmationCode as codeCheck,
	email as emailCheck,
	fields,
	readJsonObject
} from '$lib/server/validate';

// Confirms a promoter's venue (/register/promoter) with the e-mailed code. bars.general_email is
// unique, so the venue is found by e-mail alone; it used to be looked up by e-mail and the
// user's city as well, which added nothing.
export const POST: RequestHandler = async ({ request }) => {
	try {
		// Checked before any query, so a malformed guess never spends an attempt (ROADMAP
		// section 4)
		const body = await readJsonObject(request);
		const input = fields({
			email: emailCheck(body?.email),
			confirmationCode: codeCheck(body?.confirmationCode)
		});
		if (!input.ok) return json({ error: SAY.code }, { status: 400 });
		const { email, confirmationCode } = input.value;

		// Every guess spends one of the code's attempts, in the statement that reads it
		// (KNOWN_ISSUES 55)
		const attempt = await spendCodeAttempt(pool, 'bars', email, [
			'confirmation_code',
			`${BAR_CODE_SECONDS_LEFT_SQL} AS seconds_left`
		]);
		if (attempt.outcome === 'exhausted') {
			return json({ error: CODE_ATTEMPTS_EXHAUSTED }, { status: 429 });
		}
		if (attempt.outcome === 'not_found') {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const { confirmation_code, seconds_left } = attempt.row;

		// Check if the confirmation code has expired
		if (!barCodeStillValid(seconds_left as number | null)) {
			return json({ error: 'Confirmation code expired' }, { status: 400 });
		}

		// Validate the provided confirmation code
		if (!confirmation_code || confirmation_code !== confirmationCode) {
			return json({ error: 'Invalid confirmation code' }, { status: 400 });
		}

		await query(
			`UPDATE clubfindr.bars SET confirmed = true, confirmation_attempts = 0
			 WHERE LOWER(general_email) = LOWER($1)`,
			[email]
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error in confirm handler:', error);
		return json({ error: 'An unexpected error occurred' }, { status: 500 });
	}
};
