import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db'; // adjust according to your database setup
import { json } from '@sveltejs/kit'; // Use SvelteKit's json helper for responses
import { cookieManager } from '$lib/cookieManager';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { newName } = await request.json();
	const userId = cookieManager.get(cookies, 'usersId'); // Use const for sessionId

	if (!userId) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	try {
		await query(
			`UPDATE clubfindr.users
             SET name = $1
             WHERE id = $2;`,
			[newName, userId]
		);

		return json({ message: 'Name updated successfully' }, { status: 200 });
	} catch (error) {
		console.error('Error updating name:', error);
		return json({ error: 'Failed to update name' }, { status: 500 });
	}
};
