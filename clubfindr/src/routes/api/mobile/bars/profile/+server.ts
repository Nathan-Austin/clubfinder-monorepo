// api/mobile/bar/profile/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { validateBarToken } from '$lib/authUtils';

export const GET: RequestHandler = async ({ request }) => {
	console.log('========================');
	console.log('BAR PROFILE REQUEST');
	console.log('========================');

	try {
		// Validate authentication token
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Missing or invalid authentication token'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		const token = authHeader.split(' ')[1];
		const barSession = await validateBarToken(token);

		if (!barSession) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid or expired token'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Get bar data
		const dbStart = Date.now();
		const barResult = await query(
			`SELECT 
                id, name, address, city, postcode, phone, general_email, 
                opening_hours, description, website, contact_person,
                created_at, updated_at
            FROM clubfindr.bars 
            WHERE id = $1`,
			[barSession.barId]
		);
		console.log('Bar data lookup:', Date.now() - dbStart, 'ms');

		if (!barResult.rows || barResult.rows.length === 0) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Bar not found'
				}),
				{
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Return bar data
		return new Response(
			JSON.stringify({
				success: true,
				bar: barResult.rows[0]
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		console.error('Bar profile error:', error);
		return new Response(
			JSON.stringify({
				success: false,
				message: 'Server error'
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};
