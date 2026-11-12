// api/mobile/login/+server.ts
// Handle mobile app user authentication and session management
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { comparePassword } from '$lib/server/passwordUtils';
import { normalizeCityName } from '$lib/cityName';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '$lib/db';
import { countFavouriteArtists } from '$lib/taste/favouriteArtists';
import { artistOnboardingStatus } from '$lib/taste/onboarding';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Parse request body
		const data = await request.json();

		const { email, password } = data;

		// Basic validation
		if (!email || !password) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Missing email or password'
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Get user from database
		const result = await query(
			'SELECT id, name, city, password_hash, is_first_time, onboarding_complete FROM clubfindr.users WHERE general_email = $1',
			[email]
		);

		if (!result.rows || result.rows.length === 0) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid credentials'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Check password
		const storedHashedPassword = result.rows[0].password_hash;
		const isPasswordCorrect = await comparePassword(password, storedHashedPassword);

		if (!isPasswordCorrect) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid credentials'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
		// Generate token immediately without waiting for session storage
		const user_id = result.rows[0].id;
		const userName = result.rows[0].name;
		const city = result.rows[0].city;
		const normalizedCityName = normalizeCityName(city);
		const sessionId = uuidv4();
		const isFirstTimeUser = result.rows[0].is_first_time;
		const onboardingComplete = result.rows[0].onboarding_complete;
		// Prepare response
		const responseBody = {
			success: true,
			token: sessionId,
			user: {
				id: user_id,
				email: email,
				name: userName,
				city: normalizedCityName,
				// Per-user Spotify connect is retired. These stay null (what production answered
				// since SPOTIFY_CONNECT_ENABLED=false) for app builds that still read them.
				spotify_app_name: null,
				clientId: null,
				clientSecret: null,
				isFirstTimeUser,
				onboardingComplete,
				// The artist picker step (src/lib/taste/onboarding.ts); derived, like on the web
				artistOnboarding: artistOnboardingStatus(await countFavouriteArtists(pool, user_id))
			},
			spotifyConnectEnabled: false
		};

		// The token is only good once its user_sessions row exists, so write it before answering
		// (in the background, the app's first request could beat it). createSession logs its own
		// errors and never throws.
		await createSession(sessionId, user_id, normalizedCityName);

		// Return success response immediately
		return new Response(JSON.stringify(responseBody), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Mobile login error:', error);
		return new Response(
			JSON.stringify({
				success: false,
				message: 'Server error'
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

// Background function to create session without blocking the response
async function createSession(sessionId: string, userId: string, city: string) {
	try {
		// One statement, not DELETE then INSERT: see the note in /login/users. Two logins by the
		// same user at once raced on the UNIQUE user_id, and the loser answered 500.
		await query(
			`
            INSERT INTO clubfindr.user_sessions (
                session_id,
                user_id,
                user_city,
                last_accessed,
                spotify_user_id,
                spotify_email,
                spotify_username
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id) DO UPDATE SET
                session_id = EXCLUDED.session_id,
                user_city = EXCLUDED.user_city,
                last_accessed = EXCLUDED.last_accessed,
                spotify_user_id = EXCLUDED.spotify_user_id,
                spotify_email = EXCLUDED.spotify_email,
                spotify_username = EXCLUDED.spotify_username,
                genres = NULL,
                access_token = NULL,
                refresh_token = NULL,
                spotify_app_id = NULL,
                created_at = CURRENT_TIMESTAMP
            `,
			[
				sessionId,
				userId,
				city,
				new Date().toISOString(),
				null, // spotify_user_id
				null, // spotify_email
				null // spotify_username
			]
		);
	} catch (error) {
		console.error('Session creation error:', error);
	}
}
