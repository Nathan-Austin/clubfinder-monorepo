import { LEGACY_SPOTIFY_KEYS, purgeLegacySpotifyData } from '../legacySpotify';

function fakeStore(initial: Record<string, string>) {
    const data = new Map(Object.entries(initial));
    return {
        data,
        multiRemove: jest.fn(async (keys: readonly string[]) => {
            keys.forEach((key) => data.delete(key));
        })
    };
}

describe('purgeLegacySpotifyData', () => {
    it('removes the Spotify tokens and credentials and keeps everything else', async () => {
        const store = fakeStore({
            spotify_access_token: 'a',
            spotify_refresh_token: 'r',
            spotify_client_secret: 's',
            bar_spotify_client_secret: 'b',
            spotifyConnected: 'true',
            authToken: 'session',
            'selected-genres': 'techno,house',
            userCity: 'berlin'
        });
        await purgeLegacySpotifyData(store);
        expect(Object.fromEntries(store.data)).toEqual({
            authToken: 'session',
            'selected-genres': 'techno,house',
            userCity: 'berlin'
        });
    });

    it('never touches the session or the genre picker', () => {
        expect(LEGACY_SPOTIFY_KEYS).not.toContain('authToken');
        expect(LEGACY_SPOTIFY_KEYS).not.toContain('selected-genres');
    });

    it('does not throw when storage fails', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const store = { multiRemove: jest.fn(async () => Promise.reject(new Error('disk full'))) };
        await expect(purgeLegacySpotifyData(store)).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
