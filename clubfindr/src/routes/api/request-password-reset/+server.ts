import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { sendEmail } from '$lib/email';
import { randomBytes } from 'crypto';
import { hashToken } from '$lib/encryptionUtils';
import { SAY, email as emailCheck, readJsonObject } from '$lib/server/validate';

export const POST: RequestHandler = async ({ request, url }) => {
	// Checked before any query: a body that was not JSON threw here, outside the try (500), and a
	// missing e-mail was looked up as NULL and answered success (ROADMAP section 4). A malformed
	// address says nothing about which accounts exist, so refusing it leaks nothing.
	const body = await readJsonObject(request);
	const checked = emailCheck(body?.email);
	if (!checked.ok) return json({ success: false, message: SAY.email }, { status: 400 });
	const email = checked.value;
	// Started from the venue login (/login/bars, the app's venue login: ?from=bars on the page):
	// the venue's link goes first in the mail, since that is the login being reset. Anything
	// else, or nothing, keeps the personal account first.
	const fromVenueLogin = body?.from === 'bars';

	try {
		// A person's account (users) and a venue's own login (bars.password_hash) can share an
		// address, and either may be the one forgotten, so both get a link. Venues were left out
		// until 2026-11-16 and could not reset at all (KNOWN_ISSUES 68). A venue row without a
		// password (a promoter's) is not a login and gets none.
		const tokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
		const links: { label: string; token: string }[] = [];

		const userResult = await query('SELECT id FROM clubfindr.users WHERE general_email = $1', [
			email
		]);
		if ((userResult.rowCount ?? 0) > 0) {
			const token = randomBytes(32).toString('hex');
			// Store only a hash of the token; the e-mailed link carries the token itself
			await query(
				`INSERT INTO clubfindr.password_resets (user_id, reset_token, expires_at)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (user_id)
				 DO UPDATE SET reset_token = $2, expires_at = $3, updated_at = NOW()`,
				[userResult.rows[0].id, hashToken(token), tokenExpiry]
			);
			links.push({ label: 'Your personal account', token });
		}

		const barResult = await query(
			`SELECT id, name FROM clubfindr.bars
			  WHERE general_email = $1 AND password_hash IS NOT NULL`,
			[email]
		);
		if ((barResult.rowCount ?? 0) > 0) {
			const token = randomBytes(32).toString('hex');
			await query(
				`INSERT INTO clubfindr.bar_password_resets (bar_id, reset_token, expires_at)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (bar_id)
				 DO UPDATE SET reset_token = $2, expires_at = $3, updated_at = NOW()`,
				[barResult.rows[0].id, hashToken(token), tokenExpiry]
			);
			links.push({ label: `The venue login of ${barResult.rows[0].name}`, token });
		}

		// Always the same answer, whether or not the address has an account (security best practice)
		if (links.length === 0) {
			return json({ success: true });
		}
		if (fromVenueLogin) links.reverse();

		// The site the request came from (ORIGIN in production), so the token matches the deployment
		const linkText = links
			.map((link) =>
				links.length > 1
					? `${link.label}:\n${url.origin}/password-reset/${link.token}`
					: `${url.origin}/password-reset/${link.token}`
			)
			.join('\n\n');
		await sendEmail(
			email,
			'Password Reset Request',
			`You have requested to reset your password. Click the link below to set a new password:

${linkText}

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
