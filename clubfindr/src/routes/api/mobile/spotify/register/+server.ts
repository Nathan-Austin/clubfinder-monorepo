// api/mobile/spotify/register/+server.ts
// Stores the Spotify tokens a user just obtained in the app (mobileSpotifyService posts here
// after the OAuth code exchange). This used to take any user id, mint a session for it and
// return the Spotify client secret, so anyone who learned a user's id could log in as them
// (KNOWN_ISSUES 42). It now requires the caller's own session — the app's Bearer token or the
// web session cookie, like the taste endpoints — refuses a mismatched userId, keeps the
// caller's existing session instead of minting one, and no longer returns the client secret
// (the app takes its OAuth credentials from the login response, not from here).
import type { RequestHandler } from '@sveltejs/kit';
import { pool, withTransaction } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const requestData = await request.json();
		const { accessToken, refreshToken, userId, spotifyProfile } = requestData;

		// Validate required fields
		if (!accessToken || !userId) {
			return jsonResponse(
				{
					success: false,
					message: 'Missing required data'
				},
				400
			);
		}

		const sessionUserId = await getSessionUserId(cookies, pool, request);
		if (!sessionUserId) {
			return jsonResponse({ success: false, message: 'Authentication required' }, 401);
		}
		if (sessionUserId !== userId) {
			return jsonResponse({ success: false, message: 'Forbidden' }, 403);
		}

		// One transaction on one connection (KNOWN_ISSUES 39). query('BEGIN') … query('COMMIT')
		// ran each statement on whichever pooled connection was free, and the 'User not found'
		// return left the BEGIN open on its connection for the next request to inherit.
		const registered = await withTransaction(async (client) => {
			// Fetch user details
			const userResult = await client.query(
				`SELECT
	                u.id,
	                u.name,
	                u.general_email,
	                u.city,
	                u.spotify_app_name,
	                sa.id as spotify_app_id,
	                sa.client_id,
	                sa.app_name
	             FROM clubfindr.users u
	             LEFT JOIN clubfindr.spotify_apps sa ON sa.app_name = u.spotify_app_name
	             WHERE u.id = $1`,
				[userId]
			);

			if (!userResult?.rows || userResult.rows.length === 0) {
				return null;
			}

			const user = userResult.rows[0];
			const spotifyApp = {
				id: user.spotify_app_id,
				clientId: user.client_id,
				appName: user.app_name || user.spotify_app_name // Fallback to the name stored in user table
			};

			// If no Spotify profile provided but we have token, we can still continue
			const spotifyId = spotifyProfile?.id || null;
			const spotifyEmail = spotifyProfile?.email || null;

			// Update user with Spotify tokens and ID
			await client.query(
				`UPDATE clubfindr.users
	             SET
	                access_token = $1,
	                refresh_token = $2,
	                spotify_user_id = $3,
	                spotify_email = $4
	             WHERE id = $5`,
				[accessToken, refreshToken || null, spotifyId, spotifyEmail, userId]
			);

			// Store the Spotify tokens on the caller's existing session. user_id is UNIQUE in
			// user_sessions and the caller just authenticated with this row, so it exists;
			// session_id stays as it is — rotating it here would log the caller's other
			// surface (web or app) out for no reason, and the caller already holds a token.
			const sessionResult = await client.query(
				`UPDATE clubfindr.user_sessions
				 SET access_token = $1,
				     refresh_token = $2,
				     spotify_user_id = $3,
				     spotify_email = $4,
				     spotify_app_id = $5,
				     last_accessed = NOW()
				 WHERE user_id = $6
				 RETURNING session_id`,
				[accessToken, refreshToken || null, spotifyId, spotifyEmail, spotifyApp.id || null, userId]
			);
			const sessionId = sessionResult.rows[0]?.session_id;
			if (!sessionId) return null;

			return { user, spotifyApp, spotifyId, sessionId };
		});

		if (!registered) {
			return jsonResponse({ success: false, message: 'User not found' }, 404);
		}
		const { user, spotifyApp, spotifyId, sessionId } = registered;

		// Return success with user info and the caller's own session token
		return jsonResponse({
			success: true,
			user: {
				id: user.id,
				name: user.name,
				email: user.general_email,
				city: user.city,
				spotify_id: spotifyId,
				clientId: spotifyApp.clientId,
				spotify_app_name: spotifyApp.appName
			},
			token: sessionId,
			spotifyApp: {
				name: spotifyApp.appName
			}
		});
	} catch (err) {
		// withTransaction has already rolled back
		console.error('Spotify registration error:', err);

		return jsonResponse(
			{
				success: false,
				message: err instanceof Error ? err.message : 'Unknown error'
			},
			500
		);
	}
};

// Utility function for JSON responses
interface JsonResponseData {
	success: boolean;
	message?: string;
	user?: {
		id: string;
		name: string;
		email: string;
		city: string;
		spotify_id: string | null;
		clientId: string;
		spotify_app_name: string;
	};
	token?: string;
	spotifyApp?: {
		name: string;
	};
}

function jsonResponse(data: JsonResponseData, status: number = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
