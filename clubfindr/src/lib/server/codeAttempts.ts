// A budget of guesses for the e-mailed confirmation codes (KNOWN_ISSUES 55).
//
// A code is six hex digits (16.7 million values) and lives for 10 to 60 minutes. The confirm
// endpoints accepted unlimited guesses at it; the "3 attempts" the registration pages enforce
// are client-side, and the only server-side limit was the global 60 requests a minute per IP,
// which a few addresses get around. Every row that carries a code (clubfindr.bars and
// clubfindr.users) now also carries `confirmation_attempts`
// (migrations/20261114_confirmation_attempts.sql): each guess spends one in the same statement
// that reads the code, so parallel guesses cannot overshoot, and issuing a new code (register,
// resend, send-verification-code, …) or confirming the right one sets it back to 0. Counted in
// the database rather than in memory so a restart does not refill it.

import type { Queryable } from '$lib/taste/favouriteArtists';

/** Guesses allowed per issued code, the right one included. */
export const CODE_MAX_ATTEMPTS = 5;

/** What the confirm endpoints answer, with status 429, once the budget is spent. */
export const CODE_ATTEMPTS_EXHAUSTED =
	'Too many wrong codes. Request a new code and try again with that one.';

export type CodeTable = 'bars' | 'users';

export type CodeAttempt =
	| { outcome: 'ok'; row: Record<string, unknown> }
	| { outcome: 'not_found' }
	| { outcome: 'exhausted' };

/**
 * Spends one guess at the code of the row with this e-mail, and returns the row's `columns`
 * (plus `confirmation_attempts`, counting this guess) for the caller to compare against.
 * `exhausted` means the row exists but has no guesses left: the caller answers 429 without
 * looking at the code. The budget is consumed in the UPDATE itself, so two guesses arriving
 * together each take one, and the row lock serialises them.
 */
export async function spendCodeAttempt(
	db: Queryable,
	table: CodeTable,
	email: string,
	columns: string[]
): Promise<CodeAttempt> {
	const spent = await db.query(
		`UPDATE clubfindr.${table}
		    SET confirmation_attempts = confirmation_attempts + 1
		  WHERE LOWER(general_email) = LOWER($1) AND confirmation_attempts < $2
		  RETURNING ${[...columns, 'confirmation_attempts'].join(', ')}`,
		[email, CODE_MAX_ATTEMPTS]
	);
	if (spent.rows[0]) return { outcome: 'ok', row: spent.rows[0] };

	const exists = await db.query(
		`SELECT 1 FROM clubfindr.${table} WHERE LOWER(general_email) = LOWER($1)`,
		[email]
	);
	return exists.rows[0] ? { outcome: 'exhausted' } : { outcome: 'not_found' };
}
