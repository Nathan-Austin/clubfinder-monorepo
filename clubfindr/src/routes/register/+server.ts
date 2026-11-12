// routes/register/+server.ts
// This file handles the registration of a new bar in the ClubFindr system.
// It includes the logic for inserting or updating user and bar information in the database,
// and sending notification emails. A venue names no music service: its taste comes from the
// artists and genres it declares on the dashboard (per-venue Spotify connect is retired).

import { json } from '@sveltejs/kit';
import { withTransaction } from '$lib/db';
import { randomBytes } from 'crypto';
import { sendEmail } from '$lib/email';
import { normalizeCityName } from '$lib/cityName';
import type { RequestHandler } from '@sveltejs/kit';
import { hashPassword } from '$lib/server/passwordUtils';
import { clearCaptchaVerified, hasVerifiedCaptcha } from '$lib/server/captcha';

// Get the form data
export const POST: RequestHandler = async ({ request, cookies }) => {
	// The browser-side check alone proved nothing: a script could skip the form and post here
	// directly (KNOWN_ISSUES 28). /api/verify-captcha sets this cookie when the token is good.
	if (!hasVerifiedCaptcha(cookies)) {
		return json(
			{ success: false, message: 'Please complete the reCAPTCHA check first.' },
			{ status: 403 }
		);
	}

	const {
		businessName,
		contactPerson,
		email,
		phone,
		address,
		postcode,
		cityName,
		website,
		password,
		smokingAllowed = false,
		barTypes = []
	} = await request.json();

	// musicService / musicServiceEmail from an older form are ignored

	// Generate a random confirmation code
	const confirmationCode = randomBytes(3).toString('hex').toUpperCase(); // e.g., "A1B2C3"
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes expiry time
	const hashedPassword = await hashPassword(password);
	let barId: string | undefined;

	try {
		const normalizedCityName = normalizeCityName(cityName);

		// One transaction on one connection (KNOWN_ISSUES 39): query('BEGIN') … query('COMMIT')
		// ran each statement on whichever pooled connection was free.
		barId = await withTransaction(async (client) => {
			let barId: string | undefined;
			// First check if the user already exists
			const existingUserResult = await client.query(
				`SELECT id FROM clubfindr.users WHERE general_email = $1`,
				[email]
			);

			let userId;
			if (existingUserResult.rows.length > 0) {
				// User already exists, use their ID
				userId = existingUserResult.rows[0].id;

				// Update user role to manager if not already
				await client.query(
					`UPDATE clubfindr.users 
					 SET role = 'manager', updated_at = NOW() 
					 WHERE id = $1 AND (role IS NULL OR role != 'manager')`,
					[userId]
				);

				// Update user password
				await client.query(
					`UPDATE clubfindr.users 
					 SET password_hash = $1, updated_at = NOW() 
					 WHERE id = $2`,
					[hashedPassword, userId]
				);
			} else {
				// Insert new user
				const userIdResult = await client.query(
					`INSERT INTO clubfindr.users (general_email, password_hash, city, role, created_at, updated_at) 
					 VALUES ($1, $2, $3, 'manager', NOW(), NOW()) 
					 RETURNING id`,
					[email, hashedPassword, normalizedCityName]
				);
				userId = userIdResult.rows[0]?.id;
				if (!userId) {
					throw new Error('User registration failed.');
				}
			}

			// Check if a bar with this email already exists
			const existingBarResult = await client.query(
				`SELECT id FROM clubfindr.bars WHERE general_email = $1`,
				[email]
			);

			if (existingBarResult.rows.length > 0) {
				// Update existing bar record
				barId = existingBarResult.rows[0].id;
				await client.query(
					`UPDATE clubfindr.bars 
					 SET user_id = $1,
					     name = $2,
					     contact_person = $3,
					     phone = $4,
					     address = $5,
					     postcode = $6,
					     website = $7,
					     city = $8,
					     confirmation_code = $9,
					     expires_at = $10,
					     password_hash = $11,
					     smoking_allowed = $13,
					     bar_types = $14
					 WHERE general_email = $12
					 RETURNING id`,
					[
						userId,
						businessName,
						contactPerson,
						phone,
						address,
						postcode,
						website,
						normalizedCityName,
						confirmationCode,
						expiresAt,
						hashedPassword,
						email,
						smokingAllowed,
						barTypes
					]
				);
			} else {
				// Insert new bar record
				const barResult = await client.query(
					`INSERT INTO clubfindr.bars (
						user_id, 
						name, 
						contact_person, 
						general_email, 
						phone, 
						address, 
						postcode, 
						website,
						city,
						confirmation_code,
						expires_at,
						password_hash,
						smoking_allowed,
						bar_types
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
					RETURNING id`,
					[
						userId,
						businessName,
						contactPerson,
						email,
						phone,
						address,
						postcode,
						website,
						normalizedCityName,
						confirmationCode,
						expiresAt,
						hashedPassword,
						smokingAllowed,
						barTypes
					]
				);

				barId = barResult.rows[0].id;
			}

			return barId as string;
		});

		// Send a notification to yourself
		await sendEmail(
			'admin@clubfindr.com', // Replace with your email address
			'New Bar Registration',
			`New bar has registered:\n
			Business Name: ${businessName}\n
			Contact Person: ${contactPerson}\n
			Email: ${email}\n
			City: ${cityName}`
		);

		// Send a confirmation email to the bar owner
		await sendEmail(
			email, // Send to the bar owner's email
			'Registration Confirmation Code',
			`Thank you for registering your bar with ClubFindr!\n
			We have received the following information:\n
			Business Name: ${businessName}\n
			Contact Person: ${contactPerson}\n
			City: ${cityName}\n
			\n
			\n
			Please enter your confirmation code on the open page. It will expire in 10 minutes. \n 
			Your confirmation code is ${confirmationCode}.\n
			\n
			\n
			We will review your registration and get back to you shortly.`
		);

		// Set cookies
		cookies.set('bar_city', normalizedCityName, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600 // 1 hour
		});
		cookies.set('bar_email', email, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600 // 1 hour
		});
		cookies.set('userType', 'bar', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600 // 1 hour
		});
		cookies.set('bar_name', businessName, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600 // 1 hour
		});
		cookies.set('barsName', businessName, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600 // 1 hour
		});
		cookies.set('bar_id', String(barId), {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600 // 1 hour
		});

		// One solved captcha admits one registration
		clearCaptchaVerified(cookies);

		return json({ success: true });
	} catch (error) {
		console.error('Error during registration:', error);
		return json({ success: false, message: 'Registration failed' }, { status: 500 });
	}
};
