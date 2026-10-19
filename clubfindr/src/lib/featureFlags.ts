// Runtime feature flags (process.env, no rebuild needed). Each one has a default that keeps
// today's behaviour, so an .env without the variable changes nothing.

import { env } from '$env/dynamic/private';

const OFF_VALUES = new Set(['false', '0', 'off', 'no', 'disabled']);

/** Parses an on/off flag; anything but an explicit "off" value means on. */
export function isFlagEnabled(value: string | undefined, defaultValue = true): boolean {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return defaultValue;
	return !OFF_VALUES.has(normalized);
}

/**
 * SPOTIFY_CONNECT_ENABLED: the "Connect with Spotify" buttons for users on / and
 * /users-home. Default on. Switch off (=false) while the Spotify app is capped at a handful
 * of development-mode accounts and the taste profile is the way in; the bar dashboard's own
 * Spotify connection is not affected.
 */
export function isSpotifyConnectEnabled(): boolean {
	return isFlagEnabled(env.SPOTIFY_CONNECT_ENABLED, true);
}
