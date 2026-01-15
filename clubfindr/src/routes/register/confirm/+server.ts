// This file handles the registration of a new bar in the ClubFindr system.
// It verifies the confirmation code sent to the bar's email and updates the database accordingly.
// It also encrypts the Spotify tokens before storing them in the database.
// The code is structured to handle errors gracefully and provide meaningful feedback to the user.
// The code uses SvelteKit's request handler to process incoming requests and interact with the database.
// The code is designed to be modular and reusable, allowing for easy integration with other parts of the application.

import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';
import { normalizeCityName } from '$lib/spotifyUtils';
import { encryptToken } from '$lib/encryptionUtils';
import { cookieManager } from '$lib/cookieManager';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { email, confirmationCode } = await request.json();
		console.log('Request received with email:', email, 'and confirmation code:', confirmationCode);

		// Trim the email to remove any whitespace
		const normalizedEmail = email.trim().toLowerCase();

		// OPTION 1: Skip users table entirely and query directly from the bars table
		console.log('Querying bars table for confirmation code directly');
		const result = await query(
			`SELECT confirmation_code, expires_at, city FROM clubfindr.bars WHERE LOWER(general_email) = LOWER($1)`,
			[normalizedEmail]
		);
		console.log('Bars query result:', result.rows);

		// Check if Spotify tokens exist in cookies
		const spotifyAccessToken = cookieManager.get(cookies, 'spotifyAccessToken');
		const spotifyRefreshToken = cookieManager.get(cookies, 'spotifyRefreshToken');

		if (!spotifyAccessToken || !spotifyRefreshToken) {
			console.log('Spotify tokens are missing');
			return json(
				{
					error:
						'Spotify authentication tokens are missing. Please retry the Spotify login process.'
				},
				{ status: 400 }
			);
		}

		if (result.rows.length === 0) {
			console.log('No bar found in bars table with email:', normalizedEmail);
			return json(
				{
					error:
						'Bar registration not found. Please ensure you have started the registration process.'
				},
				{ status: 404 }
			);
		}

		const { confirmation_code, expires_at, city } = result.rows[0];
		console.log(
			'Database confirmation code:',
			confirmation_code,
			'Expires at:',
			expires_at,
			'City:',
			city
		);

		// Check if the confirmation code has expired
		if (new Date() > new Date(expires_at)) {
			console.log('Confirmation code has expired');
			return json(
				{ error: 'Confirmation code has expired. Please request a new code.' },
				{ status: 400 }
			);
		}

		// Validate the provided confirmation code
		if (confirmation_code !== confirmationCode) {
			console.log(
				'Invalid confirmation code. Expected:',
				confirmation_code,
				'Received:',
				confirmationCode
			);
			return json(
				{ error: 'Invalid confirmation code. Please check and try again.' },
				{ status: 400 }
			);
		}

		// After OAuth process, encrypt the tokens before saving them to the database
		console.log('Encrypting Spotify tokens');
		const encryptedSpotifyAccessToken = encryptToken(spotifyAccessToken);
		const encryptedSpotifyRefreshToken = encryptToken(spotifyRefreshToken);

		console.log('Updating bars table to confirm registration');
		await query(
			`UPDATE clubfindr.bars SET confirmed = true, spotify_access_token = $2, spotify_refresh_token = $3 WHERE LOWER(general_email) = LOWER($1) AND city = $4`,
			[normalizedEmail, encryptedSpotifyAccessToken, encryptedSpotifyRefreshToken, city]
		);
		console.log('Update successful');

		// OPTION 2: If you want to update the user's city in users table to match the bar's city
		// Uncomment this section if you also want to fix the data inconsistency
		/*
		await query(
			`UPDATE clubfindr.users SET city = $2 WHERE LOWER(general_email) = LOWER($1)`,
			[normalizedEmail, city]
		);
		console.log('Updated user city to match bar city');
		*/

		return json({ success: true });
	} catch (error) {
		console.error('Error in confirm handler:', error);
		return json(
			{ error: 'An unexpected error occurred. Please try again or contact support.' },
			{ status: 500 }
		);
	}
};
