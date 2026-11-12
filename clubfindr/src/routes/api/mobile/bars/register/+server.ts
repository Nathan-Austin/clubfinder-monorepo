// routes/api/mobile/bars/register/+server.ts
import { json } from '@sveltejs/kit';
import { withTransaction } from '$lib/db';
import { randomBytes } from 'crypto';
import type { RequestHandler } from './$types';
import { sendEmail } from '$lib/email';
import { normalizeCityName } from '$lib/cityName';
import { hashPassword } from '$lib/server/passwordUtils';

export const POST: RequestHandler = async ({ request }) => {
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

	// A venue names no music service any more (venue Spotify connect is retired); a
	// musicService / musicServiceEmail an older app version still sends is ignored.

	// Generate confirmation code
	const confirmationCode = randomBytes(3).toString('hex').toUpperCase();
	const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
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

		// Return success response immediately after commit
		const response = json({
			success: true,
			barId: barId,
			message: 'Registration successful! Please check your email for the confirmation code.'
		});

		// Mail goes out in the background, after the answer
		(async () => {
			// Send a notification to admin (wrapped in try-catch so it doesn't block confirmation email)
			try {
				await sendEmail(
					'admin@clubfindr.com',
					'New Bar Registration',
					`New bar has registered:\n
        Business Name: ${businessName}\n
        Contact Person: ${contactPerson}\n
        Email: ${email}\n
        City: ${cityName}`
				);
			} catch (adminEmailError) {
				console.error('Error sending admin notification email:', adminEmailError);
			}

			// Send a confirmation email to the bar owner (critical - log error but don't throw)
			const confirmationLink = `https://clubfindr.com/confirm-bar?email=${encodeURIComponent(
				email
			)}&code=${confirmationCode}`;
			try {
				await sendEmail(
					email,
					'Registration Confirmation Code',
					`Thank you for registering your bar with ClubFindr!

We have received the following information:
Business Name: ${businessName}
Contact Person: ${contactPerson}
City: ${cityName}

Your confirmation code is: ${confirmationCode}

Click the link below to confirm your registration:
${confirmationLink}

Or enter the code manually in the Tilki app.
This code will expire in 30 minutes.

Welcome to the Tilki/Clubfindr community! We're excited to have you here.`
				);
			} catch (confirmEmailError) {
				console.error('Error sending confirmation email to bar:', confirmEmailError);
				// Send alert to admin about failed confirmation email
				try {
					await sendEmail(
						'admin@clubfindr.com',
						'ALERT: Bar Confirmation Email Failed',
						`Failed to send confirmation email to bar.\n
        Bar ID: ${barId}\n
        Business Name: ${businessName}\n
        Email: ${email}\n
        Confirmation Code: ${confirmationCode}\n
        Error: ${
					confirmEmailError instanceof Error ? confirmEmailError.message : String(confirmEmailError)
				}`
					);
				} catch {
					console.error('Failed to send alert email about confirmation failure');
				}
			}
		})().catch((error) => {
			console.error('Error in background tasks:', error);
		});

		return response;
	} catch (error) {
		console.error('Error during bar registration:', error);
		return json({ success: false, message: 'Registration failed. Please try again later.' });
	}
};
