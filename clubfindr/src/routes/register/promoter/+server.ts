import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import { randomBytes } from 'crypto';
import { sendEmail } from '$lib/email';
import { normalizeCityName } from '$lib/spotifyUtils';
import { hashPassword } from '$lib/passwordUtils';
import type { RequestHandler } from '@sveltejs/kit';

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
		password
	} = await request.json();

	const confirmationCode = randomBytes(3).toString('hex').toUpperCase();
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
	const hashedPassword = await hashPassword(password);
	let userId: string | null = null;

	try {
		const normalizedCityName = normalizeCityName(cityName);

		await query('BEGIN');

		const userIdResult = await query(
			`INSERT INTO clubfindr.users (general_email, password_hash, city, role, created_at, updated_at, is_promoter) 
			 VALUES ($1, $2, $3, 'manager', NOW(), NOW(), TRUE) 
			 ON CONFLICT (general_email) DO NOTHING 
			 RETURNING id`,
			[email, hashedPassword, normalizedCityName]
		);

		userId = userIdResult.rows[0]?.id;

		if (!userId) {
			const updateResult = await query(
				`UPDATE clubfindr.users 
				 SET role = 'manager', is_promoter = TRUE 
				 WHERE general_email = $1 
				 RETURNING id`,
				[email]
			);

			userId = updateResult.rows[0]?.id;

			if (!userId) {
				throw new Error('User update failed.');
			}
		}

		await query(
			`INSERT INTO clubfindr.bars (user_id, name, contact_person, general_email, phone, address, postcode, 
			 website, city, confirmation_code, expires_at) 
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
			 ON CONFLICT (general_email) DO UPDATE SET confirmation_code = $10, expires_at = $11`,
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
				expiresAt
			]
		);

		await query('COMMIT');

		await sendEmail(
			'admin@clubfindr.com',
			'New Bar Registration',
			`New bar has registered:
			 Business Name: ${businessName}
			 Contact Person: ${contactPerson}
			 Email: ${email}
			 City: ${cityName}`
		);

		await sendEmail(
			email,
			'Registration Confirmation Code',
			`Thank you for registering your bar with ClubFindr!
			 Confirmation Code: ${confirmationCode}.
			 Please enter this code on the confirmation page within 10 minutes.`
		);

		cookies.set('bar_city', normalizedCityName, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600
		});
		cookies.set('bar_email', email, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600
		});
		cookies.set('userType', 'promoter', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 3600
		});

		return json({ success: true, redirectUrl: '/register/promoter/confirm' });
	} catch (error) {
		await query('ROLLBACK');
		console.error('Error during registration:', error);
		return json({ success: false, message: 'Registration failed' }, { status: 500 });
	}
};
