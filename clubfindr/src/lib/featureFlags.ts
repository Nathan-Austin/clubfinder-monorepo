// Runtime feature flags (process.env, no rebuild needed). Each one has a default that keeps
// today's behaviour, so an .env without the variable changes nothing.

import { env } from '$env/dynamic/private';
import { isFlagEnabled } from './flagValue';

export { isFlagEnabled };

/**
 * SPOTIFY_CONNECT_ENABLED: per-account Spotify connect (KNOWN_ISSUES 24). Default on. Switch
 * off (=false) while the Spotify app is capped at a handful of development-mode accounts and
 * the taste profile is the way in. When off:
 *
 * - the users' "Connect with Spotify" buttons on / and /users-home are hidden;
 * - signup asks for no music service and no Spotify e-mail, stores none, and never calls
 *   spotify_service (add_user for users, add_bar for venues). That covers web user signup
 *   (/login/users), web venue registration (/register) and the mobile equivalents
 *   (/api/mobile/signup, /api/mobile/bars/register);
 * - GET /api/mobile/config reports it, so the app can hide the same fields.
 *
 * The code paths stay in place behind the flag. Not covered: the bar dashboard's existing
 * Spotify connection on /bars (KNOWN_ISSUES 4) and the server-side app used for artist
 * lookups, which is never per account.
 */
export function isSpotifyConnectEnabled(): boolean {
	return isFlagEnabled(env.SPOTIFY_CONNECT_ENABLED, true);
}
