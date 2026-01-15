// src/lib/clientSpotifyUtils.ts
import { goto } from '$app/navigation';

// Track re-auth attempts to avoid loops
let isReauthInProgress = false;

/**
 * Handles Spotify authentication errors by redirecting to re-auth
 * @param error The error that occurred
 * @returns true if handled, false otherwise
 */
export async function handleSpotifyApiError(error: any): Promise<boolean> {
	// Avoid multiple reauth attempts
	if (isReauthInProgress) {
		return false;
	}

	// Check if it's an auth error
	const isAuthError =
		error.message?.includes('Unauthorized') ||
		error.message?.includes('token') ||
		error.message?.includes('403') ||
		error.message?.includes('401') ||
		error.message?.includes('auth');

	if (isAuthError) {
		console.log('Detected Spotify authentication error, initiating reauth flow');
		isReauthInProgress = true;

		try {
			// Get current page path for return after auth
			const returnTo = window.location.pathname + window.location.search;

			// Try server-side API
			const response = await fetch('/spotify/reauth', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ returnTo })
			});

			const result = await response.json();

			if (result.success && result.authUrl) {
				// Redirect to Spotify authorization
				window.location.href = result.authUrl;
				return true;
			} else {
				// Failed to get auth URL, redirect to login page
				goto('/?error=SpotifyReauthFailed');
				return false;
			}
		} catch (error) {
			console.error('Error during reauth process:', error);
			// Fallback to direct reauth endpoint
			window.location.href = `/spotify/reauth?returnTo=${encodeURIComponent(
				window.location.pathname
			)}`;
			return true;
		} finally {
			isReauthInProgress = false;
		}
	}

	// Not an auth error, don't handle
	return false;
}

/**
 * Safely calls the Spotify API with error handling
 * @param endpoint Spotify API endpoint (starting with /v1)
 * @param options Fetch options
 * @returns API response data or null on error
 */
export async function callSpotifyApi(endpoint: string, options: RequestInit = {}): Promise<any> {
	try {
		// Base URL
		const baseUrl = 'https://api.spotify.com/v1';
		const fullUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

		// Access token from cookies
		const accessToken = getCookie('spotifyAccessToken');

		if (!accessToken) {
			throw new Error('No Spotify access token available');
		}

		// Default options
		const fetchOptions = {
			method: 'GET',
			...options,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`,
				...options.headers
			}
		};

		// Make the API call
		const response = await fetch(fullUrl, fetchOptions);

		if (!response.ok) {
			throw new Error(`Spotify API error: ${response.status}`);
		}

		return await response.json();
	} catch (err) {
		// Handle auth errors
		const handled = await handleSpotifyApiError(err);

		if (!handled) {
			// If not handled as auth error, rethrow
			throw err;
		}

		return null;
	}
}

/**
 * Helper function to get a cookie value
 */
function getCookie(name: string): string | null {
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);

	if (parts.length === 2) {
		return parts.pop()?.split(';').shift() || null;
	}

	return null;
}

/**
 * Redirects to Spotify for re-authentication
 */
export function reconnectSpotify(): void {
	const returnPath = window.location.pathname + window.location.search;
	window.location.href = `/spotify/reauth?returnTo=${encodeURIComponent(returnPath)}`;
}
