// api/mobile/spotify/register/+server.ts
// Handle Spotify user registration and session creation for mobile app
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ request }) => {
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

		console.log('Spotify registration received for user:', userId);
		console.log('Spotify profile:', spotifyProfile ? 'Present' : 'Missing');

		// Begin transaction
		await query('BEGIN');

		// Fetch user details
		const userResult = await query(
			`SELECT 
                u.id, 
                u.name, 
                u.general_email, 
                u.city,
                u.spotify_app_name,
                sa.id as spotify_app_id,
                sa.client_id,
                sa.client_secret,
                sa.app_name
             FROM clubfindr.users u
             LEFT JOIN clubfindr.spotify_apps sa ON sa.app_name = u.spotify_app_name
             WHERE u.id = $1`,
			[userId]
		);

		if (!userResult?.rows || userResult.rows.length === 0) {
			console.log('User not found:', userId);
			return jsonResponse(
				{
					success: false,
					message: 'User not found'
				},
				404
			);
		}

		const user = userResult.rows[0];
		const spotifyApp = {
			id: user.spotify_app_id,
			clientId: user.client_id,
			clientSecret: user.client_secret,
			appName: user.app_name || user.spotify_app_name // Fallback to the name stored in user table
		};

		console.log('User found, Spotify app info:', spotifyApp.appName || 'None');

		// If no Spotify profile provided but we have token, we can still continue
		const spotifyId = spotifyProfile?.id || null;
		const spotifyEmail = spotifyProfile?.email || null;

		// Update user with Spotify tokens and ID
		await query(
			`UPDATE clubfindr.users 
             SET 
                access_token = $1, 
                refresh_token = $2, 
                spotify_user_id = $3,
                spotify_email = $4
             WHERE id = $5`,
			[accessToken, refreshToken || null, spotifyId, spotifyEmail, userId]
		);

		console.log('User updated with Spotify tokens and profile info');

		// Create a session ID
		const sessionId = uuidv4();

		// Check if a session already exists for this user
		const existingSessionResult = await query(
			`SELECT id, session_id FROM clubfindr.user_sessions WHERE user_id = $1`,
			[userId]
		);

		// If a session exists, update it instead of inserting a new one
		if (existingSessionResult?.rows && existingSessionResult.rows.length > 0) {
			console.log('Existing session found, updating instead of inserting');

			await query(
				`UPDATE clubfindr.user_sessions
				 SET session_id = $1,
				     access_token = $2,
				     refresh_token = $3,
				     spotify_user_id = $4,
				     spotify_email = $5,
				     last_accessed = NOW(),
				     spotify_app_id = $6
				 WHERE user_id = $7`,
				[
					sessionId,
					accessToken,
					refreshToken || null,
					spotifyId,
					spotifyEmail,
					spotifyApp.id || null,
					userId
				]
			);
		} else {
			// Insert a new session
			await query(
				`INSERT INTO clubfindr.user_sessions (
					user_id,
					session_id,
					user_city,
					access_token,
					refresh_token,
					spotify_user_id,
					spotify_email,
					spotify_app_id,
					last_accessed
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
				[
					userId,
					sessionId,
					user.city,
					accessToken,
					refreshToken || null,
					spotifyId,
					spotifyEmail,
					spotifyApp.id || null
				]
			);
		}

		console.log('Session updated/created with ID:', sessionId);

		// Commit transaction
		await query('COMMIT');

		// Return success with user info and session token
		return jsonResponse({
			success: true,
			user: {
				id: user.id,
				name: user.name,
				email: user.general_email,
				city: user.city,
				spotify_id: spotifyId,
				clientId: spotifyApp.clientId,
				clientSecret: spotifyApp.clientSecret,
				spotify_app_name: spotifyApp.appName
			},
			token: sessionId,
			spotifyApp: {
				name: spotifyApp.appName
			}
		});
	} catch (err) {
		// Ensure transaction is rolled back on error
		try {
			await query('ROLLBACK');
		} catch (rollbackErr) {
			console.error('Error during rollback:', rollbackErr);
		}

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
		clientSecret: string;
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
