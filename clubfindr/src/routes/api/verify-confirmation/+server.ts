// api/verify-confirmation/+server.ts
// recieives a POST request with the email and confirmation code from the mobile app

import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

export async function POST({ request }) {
	const { email, confirmationCode } = await request.json();
	//const email = localStorage.getItem('userEmail');
	console.log('Verifying confirmation for email:', email);
	console.log('Provided confirmation code:', confirmationCode);
	try {
		// Query the database to check if the confirmation code is valid
		const result = await query(
			'SELECT confirmation_code, expires_at FROM clubfindr.users WHERE general_email = $1',
			[email]
		);
		console.log('Query result:', result.rows);
		if (result.rows.length === 0) {
			console.log('User not found for email:', email);
			return json({ success: false, message: 'User not found' }, { status: 404 });
		}

		const { confirmation_code, expires_at } = result.rows[0]; // Use consistent column names

		// Check if the confirmation code is valid and not expired
		if (confirmation_code !== confirmationCode) {
			console.log('Confirmation code has expired:', expires_at);
			return json({ success: false, message: 'Invalid confirmation code' }, { status: 400 });
		}

		// Check if the confirmation code has expired (comparison in UTC)
		const now = new Date(); // Get the current time in UTC in milliseconds
		const expiresAt = new Date(expires_at); // Convert the expiration time to UTC in milliseconds

		console.log('Current time (UTC):', now.toString());
		console.log('Expiration time (UTC):', expiresAt.toString());
		if (now > expiresAt) {
			console.log('Confirmation code has expired.');
			return json({ success: false, message: 'Confirmation code has expired' }, { status: 400 });
		}

		// Clear the confirmation code after successful validation
		await query(
			'UPDATE clubfindr.users SET confirmation_code = NULL, confirmed = TRUE WHERE general_email = $1',
			[email]
		);
		console.log('Email confirmed successfully for:', email);
		return json({ success: true, message: 'Email confirmed successfully!' });
	} catch (error) {
		console.error('Error verifying confirmation code:', error);
		return json({ success: false, message: 'An unexpected error occurred' }, { status: 500 });
	}
}
