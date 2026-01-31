// src/lib/spotifyService.ts
import { error } from '@sveltejs/kit';

const SPOTIFY_SERVICE_URL = 'http://127.0.0.1:5000';

export async function addUserToSpotifyApp(userId: string, spotifyEmail: string) {
	try {
		const response = await fetch(`${SPOTIFY_SERVICE_URL}/api/add_user`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				user_id: userId,
				spotify_email: spotifyEmail
			})
		});

		if (!response.ok) {
			throw error(response.status, 'Failed to add user to Spotify app');
		}

		return await response.json();
	} catch (err) {
		console.error('Error adding user to Spotify app:', err);
		throw error(500, 'Internal server error');
	}
}

export async function getSpotifyCredentials(appName: string) {
	try {
		const response = await fetch(`${SPOTIFY_SERVICE_URL}/api/get_credentials/${appName}`);

		if (!response.ok) {
			throw error(response.status, 'Failed to get Spotify credentials');
		}

		return await response.json();
	} catch (err) {
		console.error('Error getting Spotify credentials:', err);
		throw error(500, 'Internal server error');
	}
}

// Add this to your src/lib/spotifyService.ts file

export async function addBarToSpotifyApp(barId: string, spotifyEmail: string) {
	try {
		const response = await fetch(`${SPOTIFY_SERVICE_URL}/api/add_bar`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				bar_id: barId,
				spotify_email: spotifyEmail
			})
		});

		if (!response.ok) {
			throw error(response.status, 'Failed to add bar to Spotify app');
		}

		return await response.json();
	} catch (err) {
		console.error('Error adding bar to Spotify app:', err);
		throw error(500, 'Internal server error');
	}
}
