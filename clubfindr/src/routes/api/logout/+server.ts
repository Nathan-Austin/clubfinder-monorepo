// src/routes/api/logout/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { endWebLogin } from '$lib/server/webLogout';

// The header's "Log Out": every web login this browser holds ends ($lib/server/webLogout,
// shared with the venue deletion)
export const POST: RequestHandler = async ({ cookies }) => {
	await endWebLogin(cookies);
	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json'
		}
	});
};
