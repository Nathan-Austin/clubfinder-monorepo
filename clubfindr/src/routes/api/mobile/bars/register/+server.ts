// routes/api/mobile/bars/register/+server.ts
import { json } from '@sveltejs/kit';
import { withTransaction } from '$lib/db';
import { randomBytes } from 'crypto';
import type { RequestHandler } from './$types';
import { sendEmail } from '$lib/email';
import { normalizeCityName } from '$lib/cityName';
import { hashPassword } from '$lib/server/passwordUtils';
import { VENUE_ALREADY_REGISTERED, saveVenueRegistration } from '$lib/server/venueRegistration';

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
		// $lib/server/venueRegistration: an existing personal account is linked, never changed,
		// and a confirmed venue under the address is refused. Both used to be overwritten before
		// any code was entered, which let anyone take over an account or a venue.
		const saved = await withTransaction((client) =>
			saveVenueRegistration(client, {
				businessName,
				contactPerson,
				email,
				phone,
				address,
				postcode,
				website,
				city: normalizedCityName,
				confirmationCode,
				expiresAt,
				hashedPassword,
				smokingAllowed,
				barTypes
			})
		);
		if ('conflict' in saved) {
			return json({ success: false, message: VENUE_ALREADY_REGISTERED }, { status: 409 });
		}
		barId = saved.barId;

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
