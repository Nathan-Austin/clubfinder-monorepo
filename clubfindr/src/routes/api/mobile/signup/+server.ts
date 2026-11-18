// api/mobile/signup/+server.ts

import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { hashPassword } from '$lib/server/passwordUtils';
import { generateConfirmationCode } from '$lib/codegen';
import { sendVerificationEmail } from '$lib/email';

export const POST: RequestHandler = async ({ request }) => {
	console.log('========================');
	console.log('SIGNUP REQUEST RECEIVED');
	console.log('========================');

	try {
		// Parse request body
		const data = await request.json();
		// Which fields are missing, never their values
		console.log('Signup request; missing fields:', {
			missing: ['email', 'password', 'name'].filter((field) => !data?.[field]),
			isFirstTimeUser: data?.isFirstTimeUser
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

		// No default city (owner's decision 2026-11-18): the app proposes the nearest covered
		// city after sign-in (useCityProposal) and saves it via PUT /api/account/city
		const normalizedCityName = '';

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
		SET confirmation_code = $1, expires_at = $2, confirmed = FALSE, confirmation_attempts = 0
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
