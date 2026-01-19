// routes/register/+server.ts
// This file handles the registration of a new bar in the ClubFindr system.
// It includes the logic for inserting or updating user and bar information in the database,
// sending notification emails, and interacting with the Spotify service.

import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import { randomBytes } from 'crypto';
import { sendEmail } from '$lib/email';
import { normalizeCityName } from '$lib/spotifyUtils';
import type { RequestHandler } from '@sveltejs/kit';
import { hashPassword } from '$lib/passwordUtils';
import { addBarToSpotifyApp } from '$lib/spotifyService';

// Get the form data
export const POST: RequestHandler = async ({ request, cookies }) => {
	const {
		businessName,
		contactPerson,
		email,
		phone,
		address,
		postcode,
		cityName,
		website,
		musicService,
		password,
		musicServiceEmail // Optional parameter for Spotify integration
	} = await request.json();

	// Generate a random confirmation code
	const confirmationCode = randomBytes(3).toString('hex').toUpperCase(); // e.g., "A1B2C3"
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes expiry time
	const hashedPassword = await hashPassword(password);
	let barId; // Track the bar ID for Spotify integration
	const spotifyEmail = musicServiceEmail || null;

	try {
		const normalizedCityName = normalizeCityName(cityName);

		// Start a transaction
		await query('BEGIN');

		// First check if the user already exists
		const existingUserResult = await query(
			`SELECT id FROM clubfindr.users WHERE general_email = $1`,
			[email]
		);

		let userId;
		if (existingUserResult.rows.length > 0) {
			// User already exists, use their ID
			userId = existingUserResult.rows[0].id;

			// Update user role to manager if not already
			await query(
				`UPDATE clubfindr.users 
				 SET role = 'manager', updated_at = NOW() 
				 WHERE id = $1 AND (role IS NULL OR role != 'manager')`,
				[userId]
			);

			// Update user password
			await query(
				`UPDATE clubfindr.users 
				 SET password_hash = $1, updated_at = NOW() 
				 WHERE id = $2`,
				[hashedPassword, userId]
			);
		} else {
			// Insert new user
			const userIdResult = await query(
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
		const existingBarResult = await query(
			`SELECT id FROM clubfindr.bars WHERE general_email = $1`,
			[email]
		);

		if (existingBarResult.rows.length > 0) {
			// Update existing bar record
			barId = existingBarResult.rows[0].id;
			await query(
				`UPDATE clubfindr.bars 
				 SET user_id = $1,
				     name = $2,
				     contact_person = $3,
				     phone = $4,
				     address = $5,
				     postcode = $6,
				     website = $7,
				     music_service = $8,
				     city = $9,
				     confirmation_code = $10,
				     expires_at = $11,
				     password_hash = $12,
				     spotify_email = $13
				 WHERE general_email = $14 
				 RETURNING id`,
				[
					userId,
					businessName,
					contactPerson,
					phone,
					address,
					postcode,
					website,
					musicService,
					normalizedCityName,
					confirmationCode,
					expiresAt,
					hashedPassword,
					spotifyEmail || null, // Use provided spotifyEmail or null
					email
				]
			);
		} else {
			// Insert new bar record
			const barResult = await query(
				`INSERT INTO clubfindr.bars (
					user_id, 
					name, 
					contact_person, 
					general_email, 
					phone, 
					address, 
					postcode, 
					website, 
					music_service, 
					city, 
					confirmation_code, 
					expires_at,
					password_hash,
					spotify_email
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
					musicService,
					normalizedCityName,
					confirmationCode,
					expiresAt,
					hashedPassword,
					spotifyEmail || null // Use provided spotifyEmail or null
				]
			);

			barId = barResult.rows[0].id;
		}

		// Commit the transaction if all queries succeed
		await query('COMMIT');

		// If Spotify integration is requested, register with Spotify service

		if (musicService.toLowerCase() === 'spotify' && spotifyEmail) {
			try {
				console.log(`Attempting to register bar ${barId} with Spotify service`);

				// Use the centralized function instead of direct fetch
				const spotifyResult = await addBarToSpotifyApp(barId, spotifyEmail);

				if (!spotifyResult.status || spotifyResult.status !== 'success') {
					console.error('Error registering with Spotify service:', spotifyResult);

					// Send admin notification about Spotify integration failure
					await sendEmail(
						'admin@clubfindr.com',
						'Spotify Integration Failed for Bar',
						`Spotify integration failed for bar ${businessName} (ID: ${barId}).\n
        				Spotify Email: ${spotifyEmail}\n
        				Error: ${JSON.stringify(spotifyResult)}`
					);
				}
			} catch (spotifyError) {
				// Log error but don't fail the registration
				console.error('Exception during Spotify service integration:', spotifyError);

				// Send admin notification about Spotify integration exception
				await sendEmail(
					'admin@clubfindr.com',
					'Spotify Integration Exception for Bar',
					`Spotify integration exception for bar ${businessName} (ID: ${barId}).\n
      				Spotify Email: ${spotifyEmail}\n
      				Error: ${spotifyError instanceof Error ? spotifyError.message : String(spotifyError)}`
				);
			}
		}

		// Send a notification to yourself
		await sendEmail(
			'admin@clubfindr.com', // Replace with your email address
			'New Bar Registration',
			`New bar has registered:\n
			Business Name: ${businessName}\n
			Contact Person: ${contactPerson}\n
			Email: ${email}\n
			City: ${cityName}\n
			Music Service: ${musicService}\n
			${spotifyEmail ? `Spotify Email: ${spotifyEmail}` : ''}`
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
			${musicService === 'spotify' ? 'Music Service: Spotify\n' : ''}
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

		return json({ success: true });
	} catch (error) {
		// Rollback the transaction if any query fails
		await query('ROLLBACK');
		console.error('Error during registration:', error);
		return json({ success: false, message: 'Registration failed' }, { status: 500 });
	}
};
