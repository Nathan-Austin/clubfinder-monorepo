// GET /api/mobile/config -> { spotifyConnectEnabled: false }
//
// Server-side switches the app needs before anyone has logged in. Public and read-only; CORS
// headers are added for every /api/* response in hooks.server.ts.
//
// spotifyConnectEnabled used to mirror SPOTIFY_CONNECT_ENABLED; per-account and per-venue
// Spotify connect are retired now (ROADMAP section 1), so it is always false. App builds that
// read it hide the music service choice and the Spotify e-mail field; the signup endpoints
// ignore those fields either way.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json(
		{ spotifyConnectEnabled: false },
		// Read on every app start; the short cache predates the constant and does no harm
		{ headers: { 'Cache-Control': 'public, max-age=60' } }
	);
