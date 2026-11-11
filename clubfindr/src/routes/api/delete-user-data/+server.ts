// api/delete-user-data/+server.ts
//
// "Delete my data" (/delete-confirmation; KNOWN_ISSUES 24). The account is anonymised rather
// than removed: the users row stays, so nothing that points at it breaks. Everything that
// identifies or describes the person goes, in one transaction, so a failure part-way through
// cannot leave the account half-deleted.
//
// What is cleared, and why each one matters:
//   - users: name, every e-mail and provider id, the city (emptied: the column is NOT NULL),
//     saved preferences and interested
//     events, the Spotify tokens, and the confirmation code itself so it cannot be replayed.
//     google_id and facebook_id matter most: social sign-in looks the account up by them, so
//     leaving them would let the next "Continue with Google" walk back into the deleted account.
//   - user_sessions: every session, on every device, and the in-memory session cache too, whose
//     entries carry the name and e-mail and would otherwise outlive the rows by minutes.
//   - user_favourite_artists: the taste profile. The catalogue rows in taste_artists are shared
//     with everyone and are not personal, so they stay.
//   - password_resets: outstanding reset tokens.
//
// Left in place on purpose: user_checkins (venue statistics count them, and user_id is NOT NULL,
// so they cannot be detached; with the account anonymised they no longer identify anyone) and
// any bar the user manages (a business, not personal data).

import { json } from '@sveltejs/kit';
import { withTransaction } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';
import { evictSessions } from '$lib/server/sessionCache';

export const POST = async ({ request, cookies }) => {
	const { email, confirmationCode } = await request.json();
	if (typeof email !== 'string' || typeof confirmationCode !== 'string') {
		return json({ error: 'Invalid or expired confirmation code.' }, { status: 400 });
	}

	const endedSessions = await withTransaction(async (client) => {
		// FOR UPDATE: two requests with the same code cannot both get past this point
		const result = await client.query(
			`SELECT id FROM clubfindr.users
			  WHERE (general_email = $1 OR spotify_email = $1)
			    AND confirmation_code = $2
			    AND expires_at > NOW()
			    FOR UPDATE`,
			[email, confirmationCode]
		);
		if (result.rows.length === 0) return null;

		const userId: string = result.rows[0].id;
		// general_email has to stay unique, so it is replaced rather than cleared
		const uniqueDeletedEmail = `deleted-${Date.now()}-${userId}@example.com`;

		await client.query(
			`UPDATE clubfindr.users
			    SET name = NULL,
			        general_email = $2,
			        password_hash = 'temp',
			        spotify_email = NULL,
			        apple_music_email = NULL,
			        deezer_email = NULL,
			        spotify_user_id = NULL,
			        apple_music_user_id = NULL,
			        deezer_user_id = NULL,
			        google_id = NULL,
			        facebook_id = NULL,
			        spotify_app_name = NULL,
			        access_token = NULL,
			        refresh_token = NULL,
			        city = '', -- NOT NULL, so emptied rather than cleared
			        preferences = NULL,
			        interested_events = NULL,
			        confirmation_code = NULL,
			        expires_at = NULL,
			        updated_at = NOW()
			  WHERE id = $1`,
			[userId, uniqueDeletedEmail]
		);

		const sessions = await client.query(
			'DELETE FROM clubfindr.user_sessions WHERE user_id = $1 RETURNING session_id',
			[userId]
		);
		await client.query('DELETE FROM clubfindr.user_favourite_artists WHERE user_id = $1', [userId]);
		await client.query('DELETE FROM clubfindr.password_resets WHERE user_id = $1', [userId]);

		return sessions.rows.map((row) => String(row.session_id));
	});

	if (endedSessions === null) {
		return json({ error: 'Invalid or expired confirmation code.' }, { status: 400 });
	}

	// Only after the commit: evicting first could let a request re-cache a session that a
	// rollback then kept
	evictSessions(endedSessions);
	for (const name of ['sessionId', 'isLoggedIn', 'usersName', 'usersId', 'city']) {
		cookieManager.delete(cookies, name, { path: '/' });
	}

	return json({ success: true }, { status: 200 });
};
