/**
 * Per-account and per-venue Spotify connect are retired (server: ROADMAP section 1). Builds
 * before that stored Spotify tokens, app client credentials and connection flags on the device;
 * nothing reads them any more, so they are removed at startup and at logout rather than left
 * lying around. `selected-genres` (the genre picker) is not Spotify data and stays.
 */
export const LEGACY_SPOTIFY_KEYS = [
    'spotify_access_token',
    'spotify_refresh_token',
    'spotify_expiration',
    'spotify_client_id',
    'spotify_client_secret',
    'bar_spotify_client_id',
    'bar_spotify_client_secret',
    'spotify_code_verifier',
    'spotify_last_refresh',
    'spotifyConnected',
    'spotifyUser',
    'spotifyUserType',
    'spotifyAppName',
    'spotify-genres'
] as const;

/** The part of AsyncStorage this needs, so tests can pass a fake. */
export interface KeyValueStore {
    multiRemove(keys: readonly string[]): Promise<void>;
}

/** Removes every legacy Spotify key; never throws (a failure is logged and the app carries on). */
export async function purgeLegacySpotifyData(store: KeyValueStore): Promise<void> {
    try {
        await store.multiRemove(LEGACY_SPOTIFY_KEYS);
    } catch (error) {
        console.warn('Could not clear old Spotify data:', error);
    }
}
