// api/mobile/bars/currently-playing/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { validateBarToken } from '$lib/authUtils';
import { decryptToken } from '$lib/encryptionUtils';

interface SpotifyArtist {
	name: string;
	id: string;
}

interface SpotifyAlbum {
	name: string;
}

interface SpotifyTrack {
	name: string;
	artists: SpotifyArtist[];
	album?: SpotifyAlbum;
	duration_ms: number;
}

interface CurrentlyPlayingResponse {
	item: SpotifyTrack;
	is_playing: boolean;
	progress_ms: number;
}

interface QueueResponse {
	queue: SpotifyTrack[];
}

const currentlyPlayingEndpoint = `https://api.spotify.com/v1/me/player/currently-playing`;
const queueEndpoint = `https://api.spotify.com/v1/me/player/queue`;

async function withSpotifyToken(barId: string, endpoint: string) {
	try {
		// Get bar's Spotify tokens
		const barResult = await query(
			`SELECT 
                spotify_access_token,
                spotify_app_name,
                updated_at
            FROM clubfindr.bars 
            WHERE id = $1`,
			[barId]
		);

		if (!barResult.rows || barResult.rows.length === 0) {
			return null;
		}

		const bar = barResult.rows[0];
		if (!bar.spotify_access_token) {
			return null;
		}

		// Decrypt the access token
		const accessToken = decryptToken(bar.spotify_access_token);

		// Make the Spotify API request
		const response = await fetch(endpoint, {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		});

		if (!response.ok) {
			console.error(`Spotify API error: ${response.status} ${response.statusText}`);
			return null;
		}

		const text = await response.text();
		if (!text) {
			return {};
		}

		return JSON.parse(text);
	} catch (error) {
		console.error('Error in withSpotifyToken:', error);
		return null;
	}
}

export const GET: RequestHandler = async ({ request }) => {
	console.log('========================');
	console.log('CURRENTLY PLAYING REQUEST');
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

		// Get currently playing track and queue
		const [currentPlaying, queueData] = await Promise.all([
			withSpotifyToken(
				barSession.barId,
				currentlyPlayingEndpoint
			) as Promise<CurrentlyPlayingResponse | null>,
			withSpotifyToken(barSession.barId, queueEndpoint) as Promise<QueueResponse | null>
		]);

		// Format the response
		const response = {
			success: true,
			currentlyPlaying: currentPlaying?.item
				? {
						name: currentPlaying.item.name,
						artists: currentPlaying.item.artists.map((artist: SpotifyArtist) => artist.name),
						album: currentPlaying.item.album?.name,
						duration: currentPlaying.item.duration_ms,
						progress: currentPlaying.progress_ms,
						isPlaying: currentPlaying.is_playing
				  }
				: null,
			queue: queueData?.queue
				? queueData.queue.slice(0, 5).map((track: SpotifyTrack) => ({
						name: track.name,
						artists: track.artists.map((artist: SpotifyArtist) => artist.name),
						album: track.album?.name,
						duration: track.duration_ms
				  }))
				: []
		};

		return new Response(JSON.stringify(response), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Error in currently playing endpoint:', error);
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
