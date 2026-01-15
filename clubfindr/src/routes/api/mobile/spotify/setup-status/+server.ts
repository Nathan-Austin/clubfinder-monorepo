// api/mobile/spotify/setup-status/[userId]/+server.ts

import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const userId = url.searchParams.get('userId');

		console.log('Received setup status check for userId:', userId);

		if (!userId) {
			console.error('User ID missing in query parameters');
			return new Response(
				JSON.stringify({
					success: false,
					message: 'User ID is required'
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		const result = await query(
            `SELECT 
                spotify_app_name,
                spotify_email
            FROM clubfindr.users 
            WHERE id = $1`,
            [userId]
        );

		if (!result.rows || result.rows.length === 0) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'User not found'
				}),
				{
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		const user = result.rows[0];
        console.log('User Spotify status:', {
            app_name: user.spotify_app_name
        });
        
        // Determine status based on spotify_app_name
        // If the app name is no longer 'pending', setup is complete
        if (user.spotify_app_name && user.spotify_app_name !== 'pending') {
            return new Response(
                JSON.stringify({
                    success: true,
                    status: 'complete'
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        } else {
            return new Response(
                JSON.stringify({
                    success: true,
                    status: 'pending'
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
    } catch (error) {
        console.error('Error checking Spotify setup status:', error);
        return new Response(
            JSON.stringify({
                success: false,
                message: error instanceof Error ? error.message : 'Internal server error'
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
};