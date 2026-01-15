// $lib/session.ts

import { pool } from '$lib/db';
import type { CreateSessionParams } from '$lib/$types';

export async function createSession({
	sessionId,
	spotifyUserData
}: CreateSessionParams): Promise<string> {
	const query = `
        INSERT INTO clubfindr.user_sessions (session_id, spotify_user_id, spotify_username, spotify_email, genres, access_token, refresh_token)
        VALUES ($1, $2, $3, $4, $5, $6, $7 )
        RETURNING session_id;
    `;
	const values = [
		sessionId,
		null, // spotify_user_id is not available yet, insert NULL
		null, // spotify_username is not available yet, insert NULL
		null, // spotify_email is not available yet, insert NULL
		null, // genres is not available yet, insert NULL
		spotifyUserData.accessToken,
		spotifyUserData.refreshToken
	];

	const result = await pool.query(query, values);
	return result.rows[0].session_id;
}

export async function getSession(sessionId: string): Promise<SpotifyUserData | null> {
	const query = `
        SELECT spotify_user_id, spotify_username, spotify_email, access_token, refresh_token 
        FROM clubfindr.user_sessions 
        WHERE session_id = $1;
    `;
	const result = await pool.query(query, [sessionId]);

	if (result.rows.length > 0) {
		const row = result.rows[0];
		return {
			accessToken: row.access_token,
			refreshToken: row.refresh_token
		};
	} else {
		return null; // Session not found
	}
}

export async function deleteSession(sessionId: string): Promise<void> {
	const query = `DELETE FROM user_sessions WHERE session_id = $1;`;
	await pool.query(query, [sessionId]);
}
