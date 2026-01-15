import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { encryptToken } from '$lib/encryptionUtils';

interface SpotifyConnectRequest {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
	connected: boolean;
	music_service: string;
}

interface SpotifyConnectResponse {
	success: boolean;
	token?: string;
	user?: {
		id: string;
		name?: string;
		email?: string;
		city?: string;
		spotify_id?: string;
	};
	spotifyApp?: {
		name: string;
	};
	message?: string;
}

export const POST: RequestHandler = async ({ request, params }) => {
	const barId = params.barId;
	try {
		const data = (await request.json()) as SpotifyConnectRequest;

		// Validate required fields
		if (!data.accessToken || !data.refreshToken || !data.music_service) {
			return json({
				success: false,
				message: 'Missing required fields'
			});
		}

		// Encrypt tokens before storing
		const encryptedAccessToken = encryptToken(data.accessToken);
		const encryptedRefreshToken = encryptToken(data.refreshToken);

		// Update bar's Spotify connection info
		await query(
			`UPDATE clubfindr.bars 
			SET spotify_access_token = $1,
				spotify_refresh_token = $2,
				music_service = $3,
				spotify_connected = $4,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = $5`,
			[encryptedAccessToken, encryptedRefreshToken, data.music_service, data.connected, barId]
		);

		// Get updated bar data
		const result = await query(
			`SELECT spotify_app_name, spotify_id, spotify_email
			FROM clubfindr.bars
			WHERE id = $1`,
			[barId]
		);

		const barData = result.rows[0];

		// Return success response with bar data
		const response: SpotifyConnectResponse = {
			success: true,
			spotifyApp: {
				name: barData.spotify_app_name || 'ClubFindr'
			},
			user: {
				id: barId,
				spotify_id: barData.spotify_id,
				email: barData.spotify_email
			}
		};

		return json(response);
	} catch (error) {
		console.error('Error in spotify-connect:', error);
		return json(
			{
				success: false,
				message: 'Internal server error'
			},
			{ status: 500 }
		);
	}
};
