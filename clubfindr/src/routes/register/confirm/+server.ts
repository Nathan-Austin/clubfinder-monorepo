// POST /register/confirm { email, confirmationCode } -> { success } | { error }
//
// Confirms a venue registered on the web (/register) with the code it was e-mailed. It used to
// also require the Spotify OAuth cookies that the registration form's Spotify branch left
// behind, and store them on the bar; with that branch gone (SPOTIFY_CONNECT_ENABLED=false in
// production since 2026-11-12, venue Spotify connect retired since) it answered 400 "Spotify
// authentication tokens are missing" to every venue (tests/venue-register-confirm.spec.ts).
// It also logged the expected code next to the one received; it logs neither now.

import { json } from '@sveltejs/kit';
import { pool, query } from '$lib/db';
import type { RequestHandler } from './$types';
import { BAR_CODE_SECONDS_LEFT_SQL, barCodeStillValid } from '$lib/server/barCodeExpiry';
import { CODE_ATTEMPTS_EXHAUSTED, spendCodeAttempt } from '$lib/server/codeAttempts';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, confirmationCode } = await request.json();
		if (typeof email !== 'string' || !email.trim() || typeof confirmationCode !== 'string') {
			return json({ error: 'E-mail and confirmation code are required.' }, { status: 400 });
		}
		const normalizedEmail = email.trim().toLowerCase();

		// Every guess spends one of the code's attempts, in the statement that reads it
		// (KNOWN_ISSUES 55)
		const attempt = await spendCodeAttempt(pool, 'bars', normalizedEmail, [
			'confirmation_code',
			`${BAR_CODE_SECONDS_LEFT_SQL} AS seconds_left`
		]);
		if (attempt.outcome === 'exhausted') {
			return json({ error: CODE_ATTEMPTS_EXHAUSTED }, { status: 429 });
		}
		if (attempt.outcome === 'not_found') {
			return json(
				{
					error:
						'Bar registration not found. Please ensure you have started the registration process.'
				},
				{ status: 404 }
			);
		}

		const { confirmation_code, seconds_left } = attempt.row;

		if (!barCodeStillValid(seconds_left as number | null)) {
			return json(
				{ error: 'Confirmation code has expired. Please request a new code.' },
				{ status: 400 }
			);
		}

		if (!confirmation_code || confirmation_code !== confirmationCode.trim().toUpperCase()) {
			return json(
				{ error: 'Invalid confirmation code. Please check and try again.' },
				{ status: 400 }
			);
		}

		await query(
			`UPDATE clubfindr.bars SET confirmed = true, confirmation_attempts = 0
			 WHERE LOWER(general_email) = $1`,
			[normalizedEmail]
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error in confirm handler:', error);
		return json(
			{ error: 'An unexpected error occurred. Please try again or contact support.' },
			{ status: 500 }
		);
	}
};
