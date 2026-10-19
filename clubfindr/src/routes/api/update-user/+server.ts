import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { comparePassword, hashPassword } from '$lib/server/passwordUtils';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { name, email, password, newPassword } = await request.json();

		if (!password) {
			return json({ message: 'Current password is required' }, { status: 400 });
		}

		// Verify current password
		const user = await query('SELECT password_hash FROM users WHERE id = $1', [locals.user.id]);

		if (user.rows.length === 0) {
			return json({ message: 'User not found' }, { status: 404 });
		}

		const isPasswordValid = await comparePassword(password, user.rows[0].password_hash);
		if (!isPasswordValid) {
			return json({ message: 'Invalid current password' }, { status: 400 });
		}

		// Build update query dynamically based on provided fields
		const updates = [];
		const values = [];
		let paramCount = 1;

		if (name) {
			updates.push(`name = $${paramCount}`);
			values.push(name);
			paramCount++;
		}

		if (email) {
			updates.push(`email = $${paramCount}`);
			values.push(email);
			paramCount++;
		}

		if (newPassword) {
			const hashedPassword = await hashPassword(newPassword);
			updates.push(`password_hash = $${paramCount}`);
			values.push(hashedPassword);
			paramCount++;
		}

		if (updates.length > 0) {
			values.push(locals.user.id);
			const updateQuery = `
                UPDATE users 
                SET ${updates.join(', ')} 
                WHERE id = $${paramCount}
            `;

			await query(updateQuery, values);
			return json({ message: 'Profile updated successfully' });
		}

		return json({ message: 'No changes to update' });
	} catch (error) {
		console.error('Error updating user:', error);
		return json({ message: 'An error occurred while updating profile' }, { status: 500 });
	}
};
