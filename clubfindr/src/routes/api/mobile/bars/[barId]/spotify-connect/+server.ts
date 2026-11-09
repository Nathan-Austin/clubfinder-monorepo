// Stores the Spotify tokens a venue just obtained in the app, and reports its connection
// state back. This writes the venue's credentials and returns its Spotify e-mail, so only
// that venue may call it (KNOWN_ISSUES 26): anyone who knew a bar id could overwrite the
// tokens and read the address back.
//
// The guard was held back in case the caller no longer had a venue session by this point. It
// does: mobileSpotifyService posts here while the venue is still logged in with its own
// session token, and the app sends that token on every request. The two AuthContext callers
// that post only { connected } are refused by the field check below either way.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { encryptToken } from '$lib/encryptionUtils';
import { denyUnlessBarManager } from '$lib/server/barAuth';

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

export const POST: RequestHandler = async ({ request, params, cookies }) => {
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

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
