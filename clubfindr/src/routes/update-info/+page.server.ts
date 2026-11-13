import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { query } from '$lib/db';
import { comparePassword, hashPassword } from '$lib/server/passwordUtils';
import { validateEmail } from '$lib/passwordUtils';
import { cookieManager } from '$lib/cookieManager';
import { evictSessions } from '$lib/server/sessionCache';

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
			// The column is general_email; reading .email left the form's e-mail field empty
			email: result.rows[0].general_email
		}
	};
};

export const actions = {
	default: async ({ request, locals, cookies }) => {
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
		const newEmail = email?.trim();
		if (newEmail && !validateEmail(newEmail)) {
			throw error(400, 'Please enter a valid e-mail address');
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

		// users has general_email, not email: this wrote `email` and failed with a 500 whenever
		// someone changed their address (docs/section4-inventory.md, section 2)
		if (newEmail) {
			updates.push(`general_email = $${paramCount}`);
			values.push(newEmail);
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

			try {
				await query(updateQuery, values);
			} catch (updateError) {
				// general_email is UNIQUE: another account already has this address
				if ((updateError as { code?: string }).code === '23505') {
					throw error(409, 'That e-mail address is already used by another account');
				}
				throw updateError;
			}
			// hooks.server.ts caches the session's name and e-mail for up to five minutes
			const sessionId = cookieManager.get(cookies, 'sessionId');
			if (sessionId) evictSessions([sessionId]);
		}

		return { success: true };
	}
};
