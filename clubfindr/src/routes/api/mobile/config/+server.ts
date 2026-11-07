// GET /api/mobile/config -> { spotifyConnectEnabled }
//
// Server-side switches the app needs before anyone has logged in, so signup and venue
// registration can show the same fields the web does. Public and read-only; CORS headers are
// added for every /api/* response in hooks.server.ts.
//
// spotifyConnectEnabled mirrors SPOTIFY_CONNECT_ENABLED (src/lib/featureFlags.ts). When it is
// false the app should hide the music service choice and the Spotify e-mail field; the signup
// endpoints ignore those fields either way, so an older app version cannot bring them back.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSpotifyConnectEnabled } from '$lib/featureFlags';

export const GET: RequestHandler = () =>
	json(
		{ spotifyConnectEnabled: isSpotifyConnectEnabled() },
		// Read on every app start; a short cache keeps a flag flip from taking long to land
		{ headers: { 'Cache-Control': 'public, max-age=60' } }
	);
