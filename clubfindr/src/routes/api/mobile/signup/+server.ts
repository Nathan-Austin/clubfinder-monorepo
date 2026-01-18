// api/mobile/signup/+server.ts

import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { hashPassword } from '$lib/passwordUtils';
import { normalizeCityName } from '$lib/spotifyUtils';
import { generateConfirmationCode } from '$lib/codegen';
import { sendVerificationEmail } from '$lib/email';
import { addUserToSpotifyApp } from '$lib/spotifyService';

export const POST: RequestHandler = async ({ request }) => {
	console.log('========================');
	console.log('SIGNUP REQUEST RECEIVED');
	console.log('========================');

	try {
		// Parse request body
		const data = await request.json();
		console.log('Request data received:', {
			email: data.email ? 'PRESENT' : 'MISSING',
			password: data.password ? 'PRESENT' : 'MISSING',
			name: data.name ? 'PRESENT' : 'MISSING',
			musicService: data.musicService,
			isMobileApp: true,
			isFirstTimeUser: data.isFirstTimeUser
		});

		const { name, email, password, musicService, spotifyEmail, isFirstTimeUser } = data;

		// Validate required fields
		if (!name || !email || !password || !musicService) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Missing required fields'
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Check if user already exists
		const userCheckResult = await query('SELECT id FROM clubfindr.users WHERE general_email = $1', [
			email
		]);

		if (userCheckResult.rows.length > 0) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Email already registered'
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Hash password
		const hashedPassword = await hashPassword(password);

		// Default city for new users
		const city = 'berlin';
		const normalizedCityName = normalizeCityName(city);

		// Set temporary spotify app name
		const spotifyAppName = musicService === 'spotify' ? 'pending' : null;

		// Create new user
		const newUserResult = await query(
			`INSERT INTO clubfindr.users 
            (general_email, password_hash, name, city, spotify_email, spotify_app_name, is_first_time) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING id`,
			[
				email,
				hashedPassword,
				name,
				normalizedCityName,
				spotifyEmail || email,
				spotifyAppName,
				isFirstTimeUser
			]
		);

		const userId = newUserResult.rows[0].id;

		// Generate confirmation code
		const confirmationCode = generateConfirmationCode(); // 6-digit code
		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + 1); // Expire in 1 hour

		// Store confirmation code and expiry in database
		await query(
			`UPDATE clubfindr.users 
		SET confirmation_code = $1, expires_at = $2, confirmed = FALSE 
		WHERE id = $3`,
			[confirmationCode, expiresAt, userId]
		);

		// Send verification email
		await sendVerificationEmail(email, confirmationCode);

		// If Spotify was selected, handle integration asynchronously
		if (musicService === 'spotify') {
			// Start Spotify integration in the background
			(async () => {
				try {
					console.log(`Starting Spotify app integration for user ${userId}`);
					await addUserToSpotifyApp(userId, spotifyEmail || email);
					console.log(`Spotify app integration completed for user ${userId}`);

					// Here you could also trigger a push notification or other alert
					// if you have a notification system in place
				} catch (error) {
					console.error(`Spotify integration failed for user ${userId}:`, error);
				}
			})().catch((err) => {
				console.error('Background Spotify integration error:', err);
			});

			// Return immediate success response while the integration runs in background
			return new Response(
				JSON.stringify({
					success: true,
					message: 'Account created successfully. Spotify integration is being processed.',
					userId: userId,
					requiresSpotifySetup: true,
					isFirstTimeUser: isFirstTimeUser || false
				}),
				{
					status: 201,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		} else {
			// For non-Spotify users, just return success
			return new Response(
				JSON.stringify({
					success: true,
					message: 'Account created successfully. Please verify your email.',
					userId: userId,
					requiresEmailVerification: true,
					isFirstTimeUser: isFirstTimeUser || false
				}),
				{
					status: 201,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
	} catch (error) {
		console.error('Error during signup:', error);
		return new Response(
			JSON.stringify({
				success: false,
				message: error instanceof Error ? error.message : 'Internal server error'
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

// Handle OPTIONS requests for CORS preflight
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization'
		}
	});
};
