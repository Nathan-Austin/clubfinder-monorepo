// Server-side Spotify settings for the taste endpoints. Credentials are build-time
// ($env/static); the hosts can be overridden at runtime so the e2e suite can point the server
// at tests/mock-spotify.ts (SPOTIFY_API_BASE / SPOTIFY_ACCOUNTS_BASE). Unset in production.

import { env } from '$env/dynamic/private';
import { SPOTIFY_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_SPOTIFY_CLIENT_ID } from '$env/static/public';
import type { SpotifyLookupOptions } from './spotifyArtistLookup';

export function spotifyLookupOptions(): SpotifyLookupOptions {
	return {
		credentials: { clientId: PUBLIC_SPOTIFY_CLIENT_ID, clientSecret: SPOTIFY_CLIENT_SECRET },
		apiBase: env.SPOTIFY_API_BASE || undefined,
		accountsBase: env.SPOTIFY_ACCOUNTS_BASE || undefined
	};
}
