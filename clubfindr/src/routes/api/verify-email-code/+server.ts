import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

export async function POST({ request }) {
	try {
		const { email, confirmationCode } = await request.json();
		console.log('Verifying email for:', email);

		// Query the database to check if the confirmation code is valid
		const result = await query(
			'SELECT confirmation_code, expires_at FROM clubfindr.users WHERE general_email = $1',
			[email]
		);

		if (result.rows.length === 0) {
			return json({ success: false, message: 'User not found' }, { status: 404 });
		}

		const { confirmation_code, expires_at } = result.rows[0];

		// Check if the confirmation code is valid
		if (!confirmation_code || confirmation_code !== confirmationCode) {
			return json({ success: false, message: 'Invalid confirmation code' }, { status: 400 });
		}

		// Check if the confirmation code has expired
		const now = new Date();
		const expiresAt = new Date(expires_at);

		if (now > expiresAt) {
			return json({ success: false, message: 'Confirmation code has expired' }, { status: 400 });
		}

		// Clear the confirmation code and mark email as confirmed
		await query(
			'UPDATE clubfindr.users SET confirmation_code = NULL, confirmed = TRUE WHERE general_email = $1',
			[email]
		);

		return json({ success: true, message: 'Email verified successfully!' });
	} catch (error) {
		console.error('Error verifying email:', error);
		return json({ success: false, message: 'An unexpected error occurred' }, { status: 500 });
	}
}
