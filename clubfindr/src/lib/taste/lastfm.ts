// Last.fm import for the taste profile (docs/taste-profile-design.md): a user's top artists
// become favourite artists, and each artist's top tags become its genres after passing
// through the genre classifier (tags the clusters do not know, like "seen live", are dropped).
// The HTTP client, the API host and the classifier are injectable so unit tests never touch
// the network; the e2e suite points the server at tests/mock-lastfm.ts.

import {
	addFavouriteArtist,
	FavouriteLimitError,
	findTasteArtistByName,
	listFavouriteArtists,
	MAX_FAVOURITE_ARTISTS,
	normalizeGenres,
	updateTasteArtistGenres,
	upsertTasteArtist,
	type ArtistDetails,
	type Queryable,
	type TasteArtist
} from './favouriteArtists';

export const LASTFM_API_BASE = 'https://ws.audioscrobbler.com';

/** Top artists fetched per import; keeps the tag requests (one per artist) bounded. */
export const IMPORT_ARTIST_LIMIT = 30;
/** Tag requests in flight at once; Last.fm allows about five requests a second per address. */
export const TAG_CONCURRENCY = 3;
/** Last.fm tag counts are relative (the top tag is 100); anything weaker than this is noise. */
export const MIN_TAG_COUNT = 10;
/** Genres kept per artist. */
export const MAX_GENRES_PER_ARTIST = 5;

export const LASTFM_PERIODS = ['7day', '1month', '3month', '6month', '12month', 'overall'] as const;
export type LastfmPeriod = (typeof LASTFM_PERIODS)[number];
export const DEFAULT_PERIOD: LastfmPeriod = '12month';

export function isLastfmPeriod(value: unknown): value is LastfmPeriod {
	return typeof value === 'string' && (LASTFM_PERIODS as readonly string[]).includes(value);
}

/** Last.fm usernames: 2 to 15 characters, letters, digits, - and _, starting with a letter. */
export const LASTFM_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,14}$/;

export function isValidLastfmUsername(value: unknown): value is string {
	return typeof value === 'string' && LASTFM_USERNAME_PATTERN.test(value);
}

/** Tags that are popular on Last.fm but say nothing about genre, checked before the classifier. */
const TAG_STOPLIST = new Set([
	'seen live',
	'favorites',
	'favourites',
	'favorite',
	'favourite',
	'all',
	'awesome',
	'love',
	'loved',
	'beautiful',
	'check out',
	'under 2000 listeners',
	'spotify',
	'male vocalists',
	'female vocalists',
	'singer-songwriter'
]);

export type LastfmErrorCode =
	| 'not-configured'
	| 'invalid-username'
	| 'unknown-user'
	| 'rate-limited'
	| 'invalid-key'
	| 'unavailable';

/** A failure with a message that can be shown to the user as it is. */
export class LastfmError extends Error {
	constructor(
		public readonly code: LastfmErrorCode,
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'LastfmError';
	}
}

export interface LastfmOptions {
	apiKey: string;
	apiBase?: string;
	fetch?: typeof fetch;
}

export interface LastfmArtist {
	name: string;
	mbid: string | null;
	url: string | null;
	imageUrl: string | null;
	playcount: number;
}

export interface LastfmTag {
	name: string;
	count: number;
}

interface LastfmImage {
	'#text'?: string;
	size?: string;
}

/** Last.fm reports most failures as JSON {error, message}, sometimes with a 200 status. */
function toLastfmError(payload: unknown, httpStatus: number, username?: string): LastfmError {
	const body = (payload ?? {}) as { error?: number; message?: string };
	const code = body.error;
	if (code === 6 && username) {
		return new LastfmError(
			'unknown-user',
			`Last.fm does not know a user called "${username}". Check the spelling of the username.`,
			404
		);
	}
	if (code === 29 || httpStatus === 429) {
		return new LastfmError(
			'rate-limited',
			'Last.fm is limiting our requests right now. Please try again in a minute.',
			429
		);
	}
	if (code === 10 || code === 26 || httpStatus === 403) {
		return new LastfmError(
			'invalid-key',
			'Last.fm rejected our API key. The import is misconfigured; please tell us.',
			502
		);
	}
	const detail = body.message ? ` (${body.message})` : httpStatus ? ` (HTTP ${httpStatus})` : '';
	return new LastfmError(
		'unavailable',
		`Last.fm is not answering at the moment${detail}. Please try again later.`,
		502
	);
}

async function callLastfm(
	method: string,
	params: Record<string, string>,
	options: LastfmOptions,
	username?: string
): Promise<unknown> {
	const fetchImpl = options.fetch ?? fetch;
	const url = new URL('/2.0/', options.apiBase ?? LASTFM_API_BASE);
	url.search = new URLSearchParams({
		method,
		...params,
		api_key: options.apiKey,
		format: 'json'
	}).toString();

	let response: Response;
	try {
		response = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
	} catch (error) {
		throw new LastfmError(
			'unavailable',
			`Last.fm could not be reached (${error instanceof Error ? error.message : String(error)}). Please try again later.`,
			502
		);
	}

	const payload: unknown = await response.json().catch(() => null);
	const hasError =
		!response.ok ||
		(payload !== null && typeof payload === 'object' && 'error' in (payload as object));
	if (hasError) throw toLastfmError(payload, response.status, username);
	return payload;
}

function pickImage(images: unknown): string | null {
	if (!Array.isArray(images)) return null;
	const list = images as LastfmImage[];
	const preferred =
		list.find((image) => image.size === 'large' && image['#text']) ??
		list.find((image) => !!image['#text']);
	return preferred?.['#text'] || null;
}

export function parseTopArtists(payload: unknown): LastfmArtist[] {
	const raw = (payload as { topartists?: { artist?: unknown } })?.topartists?.artist;
	const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
	const artists: LastfmArtist[] = [];
	for (const item of items as Record<string, unknown>[]) {
		const name = typeof item.name === 'string' ? item.name.trim() : '';
		if (!name) continue;
		artists.push({
			name,
			mbid: typeof item.mbid === 'string' && item.mbid ? item.mbid : null,
			url: typeof item.url === 'string' && item.url ? item.url : null,
			imageUrl: pickImage(item.image),
			playcount: Number(item.playcount ?? 0) || 0
		});
	}
	return artists;
}

export function parseTopTags(payload: unknown): LastfmTag[] {
	const raw = (payload as { toptags?: { tag?: unknown } })?.toptags?.tag;
	const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
	const tags: LastfmTag[] = [];
	for (const item of items as Record<string, unknown>[]) {
		const name = typeof item.name === 'string' ? item.name.trim() : '';
		if (!name) continue;
		tags.push({ name, count: Number(item.count ?? 0) || 0 });
	}
	return tags;
}

export async function fetchTopArtists(
	username: string,
	options: LastfmOptions,
	period: LastfmPeriod = DEFAULT_PERIOD,
	limit = IMPORT_ARTIST_LIMIT
): Promise<LastfmArtist[]> {
	const payload = await callLastfm(
		'user.gettopartists',
		{ user: username, period, limit: String(limit) },
		options,
		username
	);
	return parseTopArtists(payload);
}

export async function fetchTopTags(
	artistName: string,
	options: LastfmOptions
): Promise<LastfmTag[]> {
	const payload = await callLastfm(
		'artist.gettoptags',
		{ artist: artistName, autocorrect: '1' },
		options
	);
	return parseTopTags(payload);
}

/** Decides whether a (normalised) tag is a genre the clusters know. */
export type GenreClassifier = (tag: string) => boolean;

/**
 * Turns an artist's Last.fm tags into genres: strongest first, normalised, stoplisted tags
 * and the artist's own name dropped, then only the tags the classifier recognises, up to
 * MAX_GENRES_PER_ARTIST.
 */
export function tagsToGenres(
	tags: LastfmTag[],
	artistName: string,
	classify: GenreClassifier,
	limit = MAX_GENRES_PER_ARTIST
): string[] {
	const ownName = artistName.toLowerCase().trim();
	const candidates = [...tags]
		.filter((tag) => tag.count >= MIN_TAG_COUNT)
		.sort((a, b) => b.count - a.count)
		.map((tag) => tag.name);
	const genres: string[] = [];
	for (const tag of normalizeGenres(candidates)) {
		if (genres.length >= limit) break;
		if (tag === ownName || TAG_STOPLIST.has(tag)) continue;
		if (!classify(tag)) continue;
		genres.push(tag);
	}
	return genres;
}

export interface ImportedArtist {
	artist: TasteArtist;
	created: boolean;
}

export interface SkippedArtist {
	name: string;
	reason: 'already a favourite' | 'limit reached' | 'tags unavailable';
}

export interface LastfmImportResult {
	username: string;
	period: LastfmPeriod;
	/** How many top artists Last.fm returned. */
	found: number;
	imported: ImportedArtist[];
	skipped: SkippedArtist[];
	/** Imported artists for which no tag passed the classifier. */
	withoutGenres: string[];
	/** The user's genre profile after the import. */
	genres: string[];
	/** Set when the import stopped early (rate limit) and a retry would import more. */
	warning?: string;
}

export interface ImportDeps {
	classify: GenreClassifier;
	period?: LastfmPeriod;
	/** Tag requests in flight at once (tests use 1 for deterministic ordering). */
	concurrency?: number;
}

/** Runs `worker` over `items` with at most `concurrency` in flight, preserving result order. */
async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const runners = Array.from(
		{ length: Math.max(1, Math.min(concurrency, items.length)) },
		async () => {
			while (next < items.length) {
				const index = next++;
				results[index] = await worker(items[index], index);
			}
		}
	);
	await Promise.all(runners);
	return results;
}

/**
 * Imports a Last.fm user's top artists as favourites of `userId`. Artists the user already
 * has (same name, any source) are skipped, the favourites cap is respected, and a rate limit
 * while fetching tags stops the import with what was done so far and a warning.
 */
export async function importLastfmUser(
	db: Queryable,
	userId: string,
	username: string,
	options: LastfmOptions,
	deps: ImportDeps
): Promise<LastfmImportResult> {
	const period = deps.period ?? DEFAULT_PERIOD;
	const topArtists = await fetchTopArtists(username, options, period);

	const profile = await listFavouriteArtists(db, userId);
	const existingNames = new Set(profile.artists.map((artist) => artist.name.toLowerCase()));
	let capacity = Math.max(0, MAX_FAVOURITE_ARTISTS - profile.artists.length);

	const skipped: SkippedArtist[] = [];
	const toImport: LastfmArtist[] = [];
	for (const artist of topArtists) {
		if (existingNames.has(artist.name.toLowerCase())) {
			skipped.push({ name: artist.name, reason: 'already a favourite' });
		} else if (capacity <= 0) {
			skipped.push({ name: artist.name, reason: 'limit reached' });
		} else {
			toImport.push(artist);
			capacity -= 1;
		}
	}

	let rateLimited = false;
	const tagResults = await mapWithConcurrency(
		toImport,
		deps.concurrency ?? TAG_CONCURRENCY,
		async (artist): Promise<{ genres: string[]; failed: boolean }> => {
			if (rateLimited) return { genres: [], failed: true };
			try {
				const tags = await fetchTopTags(artist.name, options);
				return { genres: tagsToGenres(tags, artist.name, deps.classify), failed: false };
			} catch (error) {
				if (error instanceof LastfmError && error.code === 'rate-limited') rateLimited = true;
				console.warn(`Last.fm tags for "${artist.name}" unavailable:`, error);
				return { genres: [], failed: true };
			}
		}
	);

	const imported: ImportedArtist[] = [];
	const withoutGenres: string[] = [];
	for (const [index, artist] of toImport.entries()) {
		const { genres, failed } = tagResults[index];
		if (failed) {
			skipped.push({ name: artist.name, reason: 'tags unavailable' });
			continue;
		}
		// An artist we already have from another provider (same name) is reused rather than
		// catalogued twice; its genres are kept unless it had none
		let row = await findTasteArtistByName(db, artist.name);
		if (row) {
			if (row.genres.length === 0 && genres.length > 0) {
				row = await updateTasteArtistGenres(db, row.id, genres);
			}
		} else {
			const details: ArtistDetails = {
				source: 'lastfm',
				// Last.fm identifies artists by name (MBIDs are often missing), so the name is the id
				sourceId: artist.name,
				name: artist.name,
				genres,
				imageUrl: artist.imageUrl
			};
			row = await upsertTasteArtist(db, details);
		}
		try {
			const { created } = await addFavouriteArtist(db, userId, row.id);
			imported.push({ artist: row, created });
			if (row.genres.length === 0) withoutGenres.push(artist.name);
		} catch (error) {
			if (error instanceof FavouriteLimitError) {
				skipped.push({ name: artist.name, reason: 'limit reached' });
				continue;
			}
			throw error;
		}
	}

	const after = await listFavouriteArtists(db, userId);
	const result: LastfmImportResult = {
		username,
		period,
		found: topArtists.length,
		imported,
		skipped,
		withoutGenres,
		genres: after.genres
	};
	if (rateLimited) {
		result.warning =
			'Last.fm started limiting our requests, so some artists were left out. Import again in a minute to add the rest.';
	}
	return result;
}
