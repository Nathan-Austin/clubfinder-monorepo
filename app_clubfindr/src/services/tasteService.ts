/**
 * Taste profile API for the artist picker (ArtistPickerScreen): the same endpoints the web
 * uses, authenticated by the login token that axiosClient sends as a Bearer header.
 *
 *   users   /api/taste                   (the session token from /api/mobile/login)
 *   venues  /api/venues/:barId/taste     (the bar session token from /api/mobile/bars/login)
 *
 * Both answer the same shapes:
 *   GET    {base}/search?q=<name>    -> { artists: SearchHit[], warning? }
 *   GET    {base}/artists            -> { artists: PickedArtist[], genres: string[] }
 *   POST   {base}/artists            -> { artist, created, genres }
 *   DELETE {base}/artists/:id        -> { removed, genres }
 */

import axiosClient from '../api/axiosClient';

export interface PickedArtist {
    id: string;
    source: string;
    sourceId: string;
    name: string;
    genres: string[];
    imageUrl: string | null;
}

export interface SearchHit {
    source: string;
    sourceId: string;
    name: string;
    genres: string[];
    imageUrl: string | null;
    favourite: boolean;
    catalogueId: string | null;
}

export interface TasteProfile {
    artists: PickedArtist[];
    genres: string[];
}

export const USER_TASTE_BASE = '/api/taste';
export const venueTasteBase = (barId: string) => `/api/venues/${encodeURIComponent(barId)}/taste`;

/** Search needs at least this many characters (the server refuses fewer). */
export const MIN_QUERY_LENGTH = 2;

/** The server's message when there is one, else a fallback; axiosClient rejects with response.data. */
export function errorMessage(error: unknown, fallback: string): string {
    const data = (error as { response?: { data?: { message?: unknown; error?: unknown } } })?.response
        ?.data;
    const message = data?.message ?? data?.error;
    return typeof message === 'string' && message ? message : fallback;
}

export function tasteApi(base: string) {
    return {
        async list(): Promise<TasteProfile> {
            const response = await axiosClient.get(`${base}/artists`);
            const data = response.data as Partial<TasteProfile>;
            return { artists: data.artists ?? [], genres: data.genres ?? [] };
        },

        async search(query: string): Promise<{ artists: SearchHit[]; warning?: string }> {
            // In the URL: the axios adapter (NativeFetchService) does not forward `params`
            const response = await axiosClient.get(
                `${base}/search?q=${encodeURIComponent(query.trim())}`
            );
            const data = response.data as { artists?: SearchHit[]; warning?: string };
            return { artists: data.artists ?? [], warning: data.warning };
        },

        async add(hit: Pick<SearchHit, 'source' | 'sourceId'>) {
            const response = await axiosClient.post(`${base}/artists`, {
                source: hit.source,
                sourceId: hit.sourceId
            });
            return response.data as { artist: PickedArtist; created: boolean; genres: string[] };
        },

        async remove(artistId: string): Promise<{ genres?: string[] }> {
            const response = await axiosClient.delete(`${base}/artists/${artistId}`);
            return response.data as { genres?: string[] };
        }
    };
}
