// Where the server-side Spotify calls go, and how Spotify's failures are explained.
//
// The hosts can be overridden at runtime (SPOTIFY_ACCOUNTS_BASE, SPOTIFY_API_BASE) so the
// e2e suite can point the whole OAuth + API flow at tests/mock-spotify.ts; unset in
// production. The taste endpoints read the same variables (src/lib/taste/spotifyOptions.ts).

import { env } from '$env/dynamic/private';

export const DEFAULT_SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
export const DEFAULT_SPOTIFY_API_BASE = 'https://api.spotify.com';

export function spotifyAccountsBase(): string {
	return env.SPOTIFY_ACCOUNTS_BASE || DEFAULT_SPOTIFY_ACCOUNTS_BASE;
}

export function spotifyApiBase(): string {
	return env.SPOTIFY_API_BASE || DEFAULT_SPOTIFY_API_BASE;
}

export const spotifyTokenEndpoint = () => `${spotifyAccountsBase()}/api/token`;
export const spotifyApi = (path: string) => `${spotifyApiBase()}/v1${path}`;

/**
 * Spotify keeps this app in development mode, which caps it at a handful of allow-listed
 * accounts. Everyone else can complete the login, but every API call then fails with
 * 403 "User not registered in the Developer Dashboard". This is the message we show for it.
 * NOTE: the exact response body was taken from Spotify's documentation and community reports,
 * not observed against the live API (see docs/HANDOVER.md); the check is deliberately loose.
 */
export const SPOTIFY_NOT_REGISTERED_MESSAGE =
	'Spotify only lets a handful of registered accounts use this app right now, and yours is not ' +
	'one of them. You can still build your taste profile from favourite artists or a Last.fm ' +
	'import, or ask us to register your Spotify e-mail.';

export interface SpotifyFailure {
	/** Stable identifier for tests and logs. */
	kind: 'not-registered' | 'unauthorized' | 'rate-limited' | 'unavailable' | 'other';
	/** Message meant for the screen. */
	message: string;
	status: number;
}

/** Classifies a failed Spotify API response (status + body text) into a message for the user. */
export function describeSpotifyFailure(status: number, bodyText: string): SpotifyFailure {
	const body = bodyText.toLowerCase();
	if (status === 403 && /not registered|development mode|developer dashboard/.test(body)) {
		return { kind: 'not-registered', message: SPOTIFY_NOT_REGISTERED_MESSAGE, status };
	}
	if (status === 401) {
		return {
			kind: 'unauthorized',
			message: 'Your Spotify session has expired. Please connect Spotify again.',
			status
		};
	}
	if (status === 429) {
		return {
			kind: 'rate-limited',
			message: 'Spotify is limiting our requests right now. Please try again in a minute.',
			status
		};
	}
	if (status >= 500) {
		return {
			kind: 'unavailable',
			message: `Spotify is not answering at the moment (HTTP ${status}). Please try again later.`,
			status
		};
	}
	return {
		kind: 'other',
		message: `Spotify refused the request (HTTP ${status}).`,
		status
	};
}
