import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { query } from '$lib/db';
import { comparePassword, hashPassword } from '$lib/server/passwordUtils';

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is authenticated
	if (!locals.user?.id) {
		throw error(401, 'Unauthorized');
	}

	const result = await query('SELECT name, general_email FROM clubfindr.users WHERE id = $1', [
		locals.user.id
	]);

	if (result.rows.length === 0) {
		throw error(404, 'User not found');
	}

	return {
		props: {
			name: result.rows[0].name,
			email: result.rows[0].email
		}
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		// Check if user is authenticated
		if (!locals.user?.id) {
			throw error(401, 'Unauthorized');
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString();
		const email = formData.get('email')?.toString();
		const currentPassword = formData.get('password')?.toString();
		const newPassword = formData.get('newPassword')?.toString();

		if (!currentPassword) {
			throw error(400, 'Current password is required');
		}

		// Verify current password
		const user = await query('SELECT password_hash FROM clubfindr.users WHERE id = $1', [
			locals.user.id
		]);

		if (user.rows.length === 0) {
			throw error(404, 'User not found');
		}

		const isPasswordValid = await comparePassword(currentPassword, user.rows[0].password_hash);
		if (!isPasswordValid) {
			throw error(400, 'Invalid current password');
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
                UPDATE clubfindr.users 
                SET ${updates.join(', ')} 
                WHERE id = $${paramCount}
            `;

			await query(updateQuery, values);
		}

		return { success: true };
	}
};
