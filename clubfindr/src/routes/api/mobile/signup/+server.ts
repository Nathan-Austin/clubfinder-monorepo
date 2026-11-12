// api/mobile/signup/+server.ts

import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { hashPassword } from '$lib/server/passwordUtils';
import { normalizeCityName } from '$lib/cityName';
import { generateConfirmationCode } from '$lib/codegen';
import { sendVerificationEmail } from '$lib/email';

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
			isMobileApp: true,
			isFirstTimeUser: data.isFirstTimeUser
		});

		const { name, email, password, isFirstTimeUser } = data;

		// Per-user Spotify connect is retired: no music service is asked for or stored, and a
		// musicService / spotifyEmail an older app version still sends is ignored. The response
		// keeps spotifyConnectEnabled (always false) for those versions, like GET /api/mobile/config.

		// Validate required fields
		if (!name || !email || !password) {
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

		// Create new user
		const newUserResult = await query(
			`INSERT INTO clubfindr.users 
            (general_email, password_hash, name, city, is_first_time)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id`,
			[email, hashedPassword, name, normalizedCityName, isFirstTimeUser]
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

		return new Response(
			JSON.stringify({
				success: true,
				message: 'Account created successfully. Please verify your email.',
				userId: userId,
				requiresEmailVerification: true,
				spotifyConnectEnabled: false,
				isFirstTimeUser: isFirstTimeUser || false
			}),
			{
				status: 201,
				headers: { 'Content-Type': 'application/json' }
			}
		);
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
