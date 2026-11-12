// The genres a venue declares outright (ROADMAP section 1, KNOWN_ISSUES 4).
//
// The artist picker describes a venue through artists, but a venue could not say "we play
// techno" without naming an artist. These genres live on clubfindr.bars.declared_genres and
// join the venue's artist genres as its self-description in matching, at the same weight.
//
// Only genres the cluster matcher knows are accepted (the caller passes the classifier, so
// this module stays unit-testable without the server-only matcher): a declared genre exists
// solely to be matched, and one no cluster knows would sit there doing nothing, silently.

import { isUuid, normalizeGenres, type Queryable } from './favouriteArtists';

/**
 * More than enough to describe a venue's nights, few enough that the list stays a
 * description rather than a tick-all-boxes bid for every search. (Declaring everything would
 * score worse anyway: similarity divides by the union of both sides.)
 */
export const MAX_DECLARED_GENRES = 15;

/** Matches the picker's longest entries with room to spare; anything longer is not a genre. */
export const MAX_DECLARED_GENRE_LENGTH = 60;

export class DeclaredGenresError extends Error {
	constructor(
		message: string,
		/** The entries that caused it, for the client to point at. */
		public readonly genres: string[] = []
	) {
		super(message);
		this.name = 'DeclaredGenresError';
	}
}

export async function listDeclaredGenres(db: Queryable, barId: string): Promise<string[]> {
	const result = await db.query('SELECT declared_genres FROM clubfindr.bars WHERE id = $1', [
		barId
	]);
	return normalizeGenres(result.rows[0]?.declared_genres);
}

/**
 * Replaces the venue's declared genres (the picker edits the whole set, so a replace keeps
 * the API one call and idempotent). Returns the set as stored.
 */
export async function setDeclaredGenres(
	db: Queryable,
	barId: string,
	genres: unknown,
	isKnown: (genre: string) => boolean
): Promise<string[]> {
	if (!Array.isArray(genres) || genres.some((genre) => typeof genre !== 'string')) {
		throw new DeclaredGenresError('genres must be an array of strings');
	}
	const tooLong = genres.filter((genre) => genre.length > MAX_DECLARED_GENRE_LENGTH);
	if (tooLong.length > 0) {
		throw new DeclaredGenresError(
			`Genres are limited to ${MAX_DECLARED_GENRE_LENGTH} characters`,
			tooLong
		);
	}

	const normalized = normalizeGenres(genres).sort();
	if (normalized.length > MAX_DECLARED_GENRES) {
		throw new DeclaredGenresError(`Declared genres are limited to ${MAX_DECLARED_GENRES}`);
	}
	const unknown = normalized.filter((genre) => !isKnown(genre));
	if (unknown.length > 0) {
		throw new DeclaredGenresError(`Not genres Clubfindr knows: ${unknown.join(', ')}`, unknown);
	}

	const result = await db.query(
		'UPDATE clubfindr.bars SET declared_genres = $2 WHERE id = $1 RETURNING declared_genres',
		[barId, normalized]
	);
	if (result.rows.length === 0) throw new DeclaredGenresError('Unknown venue');
	return normalizeGenres(result.rows[0].declared_genres);
}

/**
 * The declared genres for several venues at once, as `barId -> genres`, one query however
 * many venues are on the page (like listFavouriteGenresForOwners, which matching merges
 * this with). Venues without declared genres are absent from the map.
 */
export async function listDeclaredGenresForOwners(
	db: Queryable,
	barIds: string[]
): Promise<Map<string, string[]>> {
	const genresByBar = new Map<string, string[]>();
	const ids = [...new Set(barIds.filter(isUuid))];
	if (ids.length === 0) return genresByBar;

	const result = await db.query(
		`SELECT id, declared_genres FROM clubfindr.bars
		 WHERE id = ANY($1) AND cardinality(declared_genres) > 0`,
		[ids]
	);
	for (const row of result.rows) {
		genresByBar.set(String(row.id), normalizeGenres(row.declared_genres));
	}
	return genresByBar;
}

/**
 * Merges two `barId -> genres` maps (artist genres and declared genres) into one
 * de-duplicated set per venue, for the matchers' self-description fold-in.
 */
export function mergeGenresByOwner(...maps: Map<string, string[]>[]): Map<string, string[]> {
	const merged = new Map<string, string[]>();
	for (const map of maps) {
		for (const [ownerId, genres] of map) {
			const existing = merged.get(ownerId) ?? [];
			merged.set(ownerId, [...new Set(existing.concat(genres))]);
		}
	}
	return merged;
}
