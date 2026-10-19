// api/mobile/login/+server.ts
// Handle mobile app user authentication and session management
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { comparePassword } from '$lib/server/passwordUtils';
import { normalizeCityName } from '$lib/spotifyUtils';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	console.log('========================');
	console.log('MOBILE FAST LOGIN REQUEST');
	console.log('========================');

	try {
		// Parse request body
		const data = await request.json();
		console.log('Request parsing:', Date.now() - startTime, 'ms');

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
		const dbStart = Date.now();
		const result = await query(
			'SELECT id, name, city, password_hash, spotify_app_name, is_first_time,onboarding_complete FROM clubfindr.users WHERE general_email = $1',
			[email]
		);
		console.log('Database lookup:', Date.now() - dbStart, 'ms');

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
		const passwordStart = Date.now();
		const storedHashedPassword = result.rows[0].password_hash;
		const isPasswordCorrect = await comparePassword(password, storedHashedPassword);
		console.log('Password verification:', Date.now() - passwordStart, 'ms');

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
		const app_name = result.rows[0].spotify_app_name;

		// Get Spotify app credentials

		const appResult = await query(
			'SELECT client_id, client_secret FROM clubfindr.spotify_apps WHERE app_name = $1',
			[app_name]
		);
		// Generate token immediately without waiting for session storage
		const tokenStart = Date.now();
		const user_id = result.rows[0].id;
		const userName = result.rows[0].name;
		const city = result.rows[0].city;
		const normalizedCityName = normalizeCityName(city);
		const sessionId = uuidv4();
		const clientId = appResult.rows[0].client_id;
		const clientSecret = appResult.rows[0].client_secret;
		const isFirstTimeUser = result.rows[0].is_first_time;
		const onboardingComplete = result.rows[0].onboarding_complete;
		console.log('Token generation:', Date.now() - tokenStart, 'ms');
		console.log('onboardingComplete:', onboardingComplete);
		// Prepare response
		const responseBody = {
			success: true,
			token: sessionId,
			user: {
				id: user_id,
				email: email,
				name: userName,
				city: normalizedCityName,
				spotify_app_name: app_name,
				clientId,
				clientSecret,
				isFirstTimeUser,
				onboardingComplete
			}
		};

		// Launch session creation in background
		createSession(sessionId, user_id, normalizedCityName).catch((error) => {
			console.error('Background session creation failed:', error);
		});

		console.log('Total processing time:', Date.now() - startTime, 'ms');

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
	const startTime = Date.now();
	try {
		// Delete any existing sessions first
		await query('DELETE FROM clubfindr.user_sessions WHERE user_id = $1', [userId]);
		console.log(`Session deletion took: ${Date.now() - startTime}ms`);

		// Create the new session
		const insertStart = Date.now();
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
		console.log(`Session creation took: ${Date.now() - insertStart}ms`);
		console.log(`Total background session handling: ${Date.now() - startTime}ms`);
	} catch (error) {
		console.error('Session creation error:', error);
	}
}
