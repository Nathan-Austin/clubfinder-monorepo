// Looks an artist up on Spotify with the app's client-credentials token: no user login, so
// it is not affected by the development-mode user cap. The token and the HTTP client are
// injectable so unit tests never reach the network.

import type { ArtistDetails, ArtistLookup } from './favouriteArtists';
import { normalizeGenres } from './favouriteArtists';

export const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
export const SPOTIFY_API_BASE = 'https://api.spotify.com';

const tokenEndpoint = (options: SpotifyLookupOptions) =>
	`${options.accountsBase ?? SPOTIFY_ACCOUNTS_BASE}/api/token`;
const artistEndpoint = (options: SpotifyLookupOptions, id: string) =>
	`${options.apiBase ?? SPOTIFY_API_BASE}/v1/artists/${id}`;
const searchEndpoint = (options: SpotifyLookupOptions, query: string, limit: number) =>
	`${options.apiBase ?? SPOTIFY_API_BASE}/v1/search?${new URLSearchParams({
		q: query,
		type: 'artist',
		limit: String(limit)
	})}`;

export const SEARCH_LIMIT = 10;

/** Spotify ids are 22 base-62 characters. */
export const SPOTIFY_ID_PATTERN = /^[0-9A-Za-z]{22}$/;

export function isSpotifyId(value: unknown): value is string {
	return typeof value === 'string' && SPOTIFY_ID_PATTERN.test(value);
}

export class SpotifyLookupError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'SpotifyLookupError';
	}
}

export interface SpotifyCredentials {
	clientId: string;
	clientSecret: string;
}

export interface SpotifyLookupOptions {
	credentials: SpotifyCredentials;
	fetch?: typeof fetch;
	now?: () => number;
	/** Override the hosts (tests point them at a mock; see tests/mock-spotify.ts). */
	accountsBase?: string;
	apiBase?: string;
}

interface SpotifyImage {
	url?: string;
	width?: number;
	height?: number;
}

/** Shapes a Spotify artist object into our ArtistDetails; null when it is not one. */
export function parseSpotifyArtist(raw: unknown): ArtistDetails | null {
	if (!raw || typeof raw !== 'object') return null;
	const artist = raw as { id?: unknown; name?: unknown; genres?: unknown; images?: unknown };
	if (!isSpotifyId(artist.id) || typeof artist.name !== 'string' || !artist.name.trim()) {
		return null;
	}
	const images = Array.isArray(artist.images) ? (artist.images as SpotifyImage[]) : [];
	const preferred =
		images.find((image) => image.width === 300 && typeof image.url === 'string') ??
		images.find((image) => typeof image.url === 'string');
	return {
		source: 'spotify',
		sourceId: artist.id,
		name: artist.name.trim(),
		genres: normalizeGenres(artist.genres),
		imageUrl: preferred?.url ?? null
	};
}

/** fetch() rejects with a TypeError when the host is unreachable; report that as a 502. */
async function fetchOrUnreachable(
	fetchImpl: typeof fetch,
	input: string,
	init: RequestInit,
	what: string
): Promise<Response> {
	try {
		return await fetchImpl(input, init);
	} catch (error) {
		throw new SpotifyLookupError(
			`Spotify is unreachable (${what}): ${error instanceof Error ? error.message : String(error)}`,
			502
		);
	}
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Client-credentials token, cached per client id until a minute before it expires. */
export async function getClientCredentialsToken(options: SpotifyLookupOptions): Promise<string> {
	const { credentials } = options;
	const fetchImpl = options.fetch ?? fetch;
	const now = options.now ?? Date.now;

	const cached = tokenCache.get(credentials.clientId);
	if (cached && cached.expiresAt > now()) return cached.token;

	const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString(
		'base64'
	);
	const response = await fetchOrUnreachable(
		fetchImpl,
		tokenEndpoint(options),
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${basic}`
			},
			body: new URLSearchParams({ grant_type: 'client_credentials' })
		},
		'token'
	);
	if (!response.ok) {
		throw new SpotifyLookupError(`Spotify token request failed (${response.status})`, 502);
	}
	const data = (await response.json()) as { access_token?: string; expires_in?: number };
	if (!data.access_token) {
		throw new SpotifyLookupError('Spotify token response had no access token', 502);
	}
	const ttlMs = Math.max(0, (data.expires_in ?? 3600) - 60) * 1000;
	tokenCache.set(credentials.clientId, { token: data.access_token, expiresAt: now() + ttlMs });
	return data.access_token;
}

export function clearTokenCache() {
	tokenCache.clear();
}

export async function fetchSpotifyArtist(
	spotifyId: string,
	options: SpotifyLookupOptions
): Promise<ArtistDetails> {
	if (!isSpotifyId(spotifyId)) {
		throw new SpotifyLookupError('Not a Spotify artist id', 400);
	}
	const fetchImpl = options.fetch ?? fetch;
	const token = await getClientCredentialsToken(options);
	const response = await fetchOrUnreachable(
		fetchImpl,
		artistEndpoint(options, spotifyId),
		{ headers: { Authorization: `Bearer ${token}` } },
		'artist'
	);
	if (response.status === 404) {
		throw new SpotifyLookupError('Spotify does not know this artist', 404);
	}
	if (!response.ok) {
		throw new SpotifyLookupError(`Spotify artist request failed (${response.status})`, 502);
	}
	const details = parseSpotifyArtist(await response.json());
	if (!details) {
		throw new SpotifyLookupError('Unexpected Spotify artist response', 502);
	}
	return details;
}

/** Artist search by name; the same Spotify search the guest "Artist or song…" path uses. */
export async function searchSpotifyArtists(
	query: string,
	options: SpotifyLookupOptions,
	limit = SEARCH_LIMIT
): Promise<ArtistDetails[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	const fetchImpl = options.fetch ?? fetch;
	const token = await getClientCredentialsToken(options);
	const response = await fetchOrUnreachable(
		fetchImpl,
		searchEndpoint(options, trimmed, limit),
		{ headers: { Authorization: `Bearer ${token}` } },
		'search'
	);
	if (!response.ok) {
		throw new SpotifyLookupError(`Spotify search failed (${response.status})`, 502);
	}
	const data = (await response.json()) as { artists?: { items?: unknown[] } };
	const items = Array.isArray(data.artists?.items) ? data.artists.items : [];
	return items.map(parseSpotifyArtist).filter((artist): artist is ArtistDetails => !!artist);
}

/** An ArtistLookup for the endpoints: Spotify now, other sources later. */
export function makeArtistLookup(options: SpotifyLookupOptions): ArtistLookup {
	return async (source, sourceId) => {
		if (source === 'spotify') return fetchSpotifyArtist(sourceId, options);
		throw new SpotifyLookupError(`Artist source "${source}" is not supported yet`, 400);
	};
}
