// api/delete-user-data/+server.ts

import { query } from '$lib/db';

export const POST = async ({ request }) => {
	const { email, confirmationCode } = await request.json();

	// Verify the confirmation code and check expiration
	const result = await query(
		`SELECT id FROM clubfindr.users 
         WHERE (general_email = $1 OR spotify_email = $1) 
         AND confirmation_code = $2 
         AND expires_at > NOW();`,
		[email, confirmationCode]
	);

	if (result.rows.length === 0) {
		return new Response(JSON.stringify({ error: 'Invalid or expired confirmation code.' }), {
			status: 400
		});
	}

	const userId = result.rows[0].id;

	// Create a unique "deleted" email by adding a timestamp and user ID
	const uniqueDeletedEmail = `deleted-${Date.now()}-${userId}@example.com`;

	// Delete sensitive user data (name, emails, Spotify data)
	await query(
		`UPDATE clubfindr.users
         SET name = NULL,
             general_email = $2,
			 password_hash = 'temp',
             spotify_email = NULL,
             apple_music_email = NULL,
             deezer_email = NULL,
             spotify_user_id = NULL,
             apple_music_user_id = NULL,
             deezer_user_id = NULL,
             access_token = NULL,
             refresh_token = NULL
         WHERE id = $1;`,
		[userId, uniqueDeletedEmail]
	);

	return new Response(JSON.stringify({ success: true }), { status: 200 });
};
