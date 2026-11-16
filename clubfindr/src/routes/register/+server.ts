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
import { VENUE_ALREADY_REGISTERED, saveVenueRegistration } from '$lib/server/venueRegistration';
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
