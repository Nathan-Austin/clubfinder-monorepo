// MusicBrainz artist tags: the last resort of the genre fallback (KNOWN_ISSUES 21).
//
// Used only when Spotify returns an artist without genres and Last.fm has nothing either,
// so this is a few requests a day, not a bulk importer. MusicBrainz needs no API key, which
// is why it can stand behind Last.fm, but it asks callers to identify themselves with a real
// User-Agent and to stay under one request a second; both are honoured here.
//
// Tag counts are raw votes (often 1 or 2), not Last.fm's 0-100 scale, so the fallback passes
// MIN_MUSICBRAINZ_TAG_COUNT to tagsToGenres instead of Last.fm's MIN_TAG_COUNT.

import type { LastfmTag } from './lastfm';

export const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org';

/**
 * MusicBrainz blocks requests without a descriptive User-Agent that names the application
 * and a way to contact us (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).
 */
export const MUSICBRAINZ_USER_AGENT = 'Clubfindr/1.0 ( https://www.clubfindr.com )';

/** A tag needs at least this many votes to count; MusicBrainz votes are small integers. */
export const MIN_MUSICBRAINZ_TAG_COUNT = 1;

/** One request a second, as the API asks. Shared by every caller in this process. */
export const MUSICBRAINZ_MIN_INTERVAL_MS = 1000;

/**
 * How many times a search is attempted before giving up, counting the first try.
 *
 * The live service answers 503 at random, well inside one request a second: one in two to one
 * in four first calls in the 2026-11-10 run (KNOWN_ISSUES 21). Genres are stored when an artist
 * is added and reused for 30 days, so a single 503 used to leave that artist without MusicBrainz
 * genres for good. Only 503 is retried — a 400 or a 404 would say the same thing again — and
 * the waits come from the rate limiter, so a retry is about a second later and still inside the
 * one-request-a-second budget. Three attempts is the point where retrying stops paying: it
 * leaves roughly a 1-in-60 chance of losing an artist's genres at the worst rate seen.
 */
export const MUSICBRAINZ_MAX_ATTEMPTS = 3;

export interface MusicbrainzOptions {
	fetch?: typeof fetch;
	/** Override the host (tests point this at tests/mock-musicbrainz.ts). */
	apiBase?: string;
	userAgent?: string;
	now?: () => number;
	/** Injected so tests do not actually wait out the rate limit. */
	sleep?: (ms: number) => Promise<void>;
}

export class MusicbrainzError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'MusicbrainzError';
	}
}

/** Pulls `{name, count}` tags out of one artist object of a search response. */
export function parseMusicbrainzTags(raw: unknown): LastfmTag[] {
	if (!raw || typeof raw !== 'object') return [];
	const tags = (raw as { tags?: unknown }).tags;
	if (!Array.isArray(tags)) return [];
	const parsed: LastfmTag[] = [];
	for (const item of tags as Record<string, unknown>[]) {
		if (!item || typeof item !== 'object') continue;
		const name = typeof item.name === 'string' ? item.name.trim() : '';
		if (!name) continue;
		parsed.push({ name, count: Number(item.count ?? 0) || 0 });
	}
	return parsed;
}

/**
 * The best artist of a search response: an exact (case-insensitive) name match if there is
 * one, else the first entry, which MusicBrainz returns in descending score order.
 */
export function pickMusicbrainzArtist(payload: unknown, artistName: string): unknown | null {
	const artists = (payload as { artists?: unknown })?.artists;
	if (!Array.isArray(artists) || artists.length === 0) return null;
	const wanted = artistName.toLowerCase().trim();
	const exact = artists.find(
		(artist) =>
			!!artist &&
			typeof artist === 'object' &&
			typeof (artist as { name?: unknown }).name === 'string' &&
			(artist as { name: string }).name.toLowerCase().trim() === wanted
	);
	return exact ?? artists[0];
}

/** -Infinity means "no request yet", so the first call never waits. */
let lastRequestAt = Number.NEGATIVE_INFINITY;

/** Resets the shared rate-limit clock (tests only). */
export function resetMusicbrainzRateLimit() {
	lastRequestAt = Number.NEGATIVE_INFINITY;
}

async function waitForRateLimit(options: MusicbrainzOptions) {
	const now = options.now ?? Date.now;
	const sleep =
		options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const waitMs = lastRequestAt + MUSICBRAINZ_MIN_INTERVAL_MS - now();
	if (waitMs > 0) await sleep(waitMs);
	lastRequestAt = now();
}

/**
 * Tags MusicBrainz has for an artist name. Returns [] when it knows no such artist; throws
 * MusicbrainzError when the service itself fails, so the caller can tell the two apart.
 */
export async function fetchMusicbrainzTags(
	artistName: string,
	options: MusicbrainzOptions = {}
): Promise<LastfmTag[]> {
	const trimmed = artistName.trim();
	if (!trimmed) return [];

	const fetchImpl = options.fetch ?? fetch;
	const url = new URL('/ws/2/artist', options.apiBase ?? MUSICBRAINZ_API_BASE);
	// A quoted phrase keeps the Lucene query from splitting the name into loose terms
	url.search = new URLSearchParams({
		query: `artist:"${trimmed.replace(/"/g, '\\"')}"`,
		fmt: 'json',
		limit: '3'
	}).toString();

	// A 503 is retried (see MUSICBRAINZ_MAX_ATTEMPTS); waitForRateLimit spaces the attempts,
	// so the retry is about a second later and the rate limit still holds.
	let response: Response | null = null;
	for (let attempt = 1; attempt <= MUSICBRAINZ_MAX_ATTEMPTS; attempt += 1) {
		await waitForRateLimit(options);

		try {
			response = await fetchImpl(url.toString(), {
				headers: {
					Accept: 'application/json',
					'User-Agent': options.userAgent ?? MUSICBRAINZ_USER_AGENT
				}
			});
		} catch (error) {
			throw new MusicbrainzError(
				`MusicBrainz could not be reached (${error instanceof Error ? error.message : String(error)})`,
				502
			);
		}

		if (response.status !== 503) break;
		if (attempt === MUSICBRAINZ_MAX_ATTEMPTS) {
			throw new MusicbrainzError(
				`MusicBrainz is rate limiting us (${MUSICBRAINZ_MAX_ATTEMPTS} attempts)`,
				429
			);
		}
	}

	if (!response) {
		throw new MusicbrainzError('MusicBrainz was never asked', 502);
	}
	if (!response.ok) {
		throw new MusicbrainzError(`MusicBrainz search failed (${response.status})`, 502);
	}

	const payload: unknown = await response.json().catch(() => null);
	if (payload === null) {
		throw new MusicbrainzError('MusicBrainz sent a response we could not read', 502);
	}
	const artist = pickMusicbrainzArtist(payload, trimmed);
	return artist ? parseMusicbrainzTags(artist) : [];
}
