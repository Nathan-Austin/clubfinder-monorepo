// Favourite artists: the first piece of the manual taste profile (docs/taste-profile-design.md).
//
// A user marks artists as favourites; the artists live in clubfindr.taste_artists with the
// genres the provider reported when they were fetched, and the user's genre profile is the
// plain set of those genres. Everything here takes its database through the `Queryable`
// parameter so it can be unit-tested with a fake; the endpoints pass `pool`.

export const MAX_FAVOURITE_ARTISTS = 50;

export const ARTIST_SOURCES = ['spotify', 'lastfm'] as const;
export type ArtistSource = (typeof ARTIST_SOURCES)[number];

export interface Queryable {
	query(
		text: string,
		params?: unknown[]
	): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

/** What we know about an artist before it has a row (the provider's answer). */
export interface ArtistDetails {
	source: ArtistSource;
	sourceId: string;
	name: string;
	genres: string[];
	imageUrl: string | null;
}

/** A row of clubfindr.taste_artists as returned to the client. */
export interface TasteArtist extends ArtistDetails {
	id: string;
	fetchedAt: string;
}

export interface FavouriteArtistsProfile {
	artists: TasteArtist[];
	/** Union of the favourites' genres, lower-cased, de-duplicated and sorted. */
	genres: string[];
}

export function isArtistSource(value: unknown): value is ArtistSource {
	return typeof value === 'string' && (ARTIST_SOURCES as readonly string[]).includes(value);
}

/** Lower-cases, trims, drops empties and duplicates; keeps first-seen order. */
export function normalizeGenres(genres: unknown): string[] {
	if (!Array.isArray(genres)) return [];
	const seen = new Set<string>();
	for (const genre of genres) {
		if (typeof genre !== 'string') continue;
		const normalized = genre.toLowerCase().trim().replace(/\s+/g, ' ');
		if (normalized) seen.add(normalized);
	}
	return [...seen];
}

/** The genre profile of a set of favourite artists: a plain, sorted set of genre strings. */
export function deriveProfileGenres(artists: Pick<ArtistDetails, 'genres'>[]): string[] {
	return [...new Set(artists.flatMap((artist) => normalizeGenres(artist.genres)))].sort();
}

export function rowToTasteArtist(row: Record<string, unknown>): TasteArtist {
	const fetchedAt = row.fetched_at;
	return {
		id: String(row.id),
		source: row.source as ArtistSource,
		sourceId: String(row.source_id),
		name: String(row.name),
		genres: normalizeGenres(row.genres),
		imageUrl: typeof row.image_url === 'string' ? row.image_url : null,
		fetchedAt: fetchedAt instanceof Date ? fetchedAt.toISOString() : String(fetchedAt ?? '')
	};
}

export async function listFavouriteArtists(
	db: Queryable,
	userId: string
): Promise<FavouriteArtistsProfile> {
	const result = await db.query(
		`SELECT a.id, a.source, a.source_id, a.name, a.genres, a.image_url, a.fetched_at
		 FROM clubfindr.user_favourite_artists f
		 JOIN clubfindr.taste_artists a ON a.id = f.artist_id
		 WHERE f.user_id = $1
		 ORDER BY f.created_at ASC, a.name ASC`,
		[userId]
	);
	const artists = result.rows.map(rowToTasteArtist);
	return { artists, genres: deriveProfileGenres(artists) };
}

/** Catalogue artists whose name contains the query (case-insensitive), for offline search. */
export async function searchTasteArtists(
	db: Queryable,
	query: string,
	limit = 10
): Promise<TasteArtist[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];
	const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
	const result = await db.query(
		`SELECT id, source, source_id, name, genres, image_url, fetched_at
		 FROM clubfindr.taste_artists
		 WHERE name ILIKE $1
		 ORDER BY (lower(name) = lower($2)) DESC, name ASC, (source = 'spotify') DESC, fetched_at DESC
		 LIMIT $3`,
		[pattern, trimmed, limit]
	);
	return result.rows.map(rowToTasteArtist);
}

/** A search hit: an artist plus whether the user already has it. */
export interface ArtistSearchHit extends ArtistDetails {
	favourite: boolean;
	/** Set when the artist is already in the local catalogue (adding it needs no provider). */
	catalogueId: string | null;
}

/**
 * Merges catalogue hits with provider hits, catalogue first, one entry per (source, id) and
 * one per artist name (the same artist may be in the catalogue from several providers), and
 * flags the ones that are already favourites. Among same-name catalogue rows a favourite wins.
 */
export function mergeSearchResults(
	catalogue: TasteArtist[],
	provider: ArtistDetails[],
	favouriteIds: Set<string>,
	limit = 10
): ArtistSearchHit[] {
	const seenIds = new Set<string>();
	const seenNames = new Set<string>();
	const hits: ArtistSearchHit[] = [];
	const orderedCatalogue = [...catalogue].sort(
		(a, b) => Number(favouriteIds.has(b.id)) - Number(favouriteIds.has(a.id))
	);
	for (const artist of orderedCatalogue) {
		const key = `${artist.source}:${artist.sourceId}`;
		const name = artist.name.toLowerCase();
		if (seenIds.has(key) || seenNames.has(name)) continue;
		seenIds.add(key);
		seenNames.add(name);
		hits.push({ ...artist, favourite: favouriteIds.has(artist.id), catalogueId: artist.id });
	}
	for (const artist of provider) {
		const key = `${artist.source}:${artist.sourceId}`;
		const name = artist.name.toLowerCase();
		if (seenIds.has(key) || seenNames.has(name)) continue;
		seenIds.add(key);
		seenNames.add(name);
		hits.push({ ...artist, favourite: false, catalogueId: null });
	}
	return hits.slice(0, limit);
}

export async function countFavouriteArtists(db: Queryable, userId: string): Promise<number> {
	const result = await db.query(
		'SELECT count(*)::int AS count FROM clubfindr.user_favourite_artists WHERE user_id = $1',
		[userId]
	);
	return Number(result.rows[0]?.count ?? 0);
}

export async function findTasteArtist(
	db: Queryable,
	source: ArtistSource,
	sourceId: string
): Promise<TasteArtist | null> {
	const result = await db.query(
		`SELECT id, source, source_id, name, genres, image_url, fetched_at
		 FROM clubfindr.taste_artists WHERE source = $1 AND source_id = $2`,
		[source, sourceId]
	);
	return result.rows.length > 0 ? rowToTasteArtist(result.rows[0]) : null;
}

/**
 * The catalogue row for an artist name, whatever its source (Spotify first, then the most
 * recently fetched). Used to attach an import from another provider to an artist we already
 * have instead of creating a second row for the same artist.
 */
export async function findTasteArtistByName(
	db: Queryable,
	name: string
): Promise<TasteArtist | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;
	const result = await db.query(
		`SELECT id, source, source_id, name, genres, image_url, fetched_at
		 FROM clubfindr.taste_artists
		 WHERE lower(name) = lower($1)
		 ORDER BY (source = 'spotify') DESC, fetched_at DESC
		 LIMIT 1`,
		[trimmed]
	);
	return result.rows.length > 0 ? rowToTasteArtist(result.rows[0]) : null;
}

/** Replaces the genres of a catalogue row (used when a row without genres gets some). */
export async function updateTasteArtistGenres(
	db: Queryable,
	artistId: string,
	genres: string[]
): Promise<TasteArtist> {
	const result = await db.query(
		`UPDATE clubfindr.taste_artists SET genres = $2 WHERE id = $1
		 RETURNING id, source, source_id, name, genres, image_url, fetched_at`,
		[artistId, normalizeGenres(genres)]
	);
	return rowToTasteArtist(result.rows[0]);
}

/** Inserts or refreshes the catalogue row for an artist and returns it. */
export async function upsertTasteArtist(
	db: Queryable,
	details: ArtistDetails
): Promise<TasteArtist> {
	const result = await db.query(
		`INSERT INTO clubfindr.taste_artists (source, source_id, name, genres, image_url, fetched_at)
		 VALUES ($1, $2, $3, $4, $5, now())
		 ON CONFLICT (source, source_id) DO UPDATE
		 SET name = EXCLUDED.name,
		     genres = EXCLUDED.genres,
		     image_url = EXCLUDED.image_url,
		     fetched_at = EXCLUDED.fetched_at
		 RETURNING id, source, source_id, name, genres, image_url, fetched_at`,
		[
			details.source,
			details.sourceId,
			details.name,
			normalizeGenres(details.genres),
			details.imageUrl
		]
	);
	return rowToTasteArtist(result.rows[0]);
}

/** Asks the provider for an artist. Throws on failure (see spotifyArtistLookup.ts). */
export type ArtistLookup = (source: ArtistSource, sourceId: string) => Promise<ArtistDetails>;

/** Catalogue rows older than this are refreshed from the provider when they are added again. */
export const ARTIST_REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns the catalogue row for an artist, creating or refreshing it from the provider when
 * there is none or it is stale. A fresh row never touches the provider, so seeded artists
 * work without network access; a stale row is kept when the provider is unreachable.
 */
export async function resolveTasteArtist(
	db: Queryable,
	source: ArtistSource,
	sourceId: string,
	lookup: ArtistLookup,
	now: () => number = Date.now
): Promise<TasteArtist> {
	const existing = await findTasteArtist(db, source, sourceId);
	if (existing) {
		const age = now() - Date.parse(existing.fetchedAt);
		if (Number.isFinite(age) && age < ARTIST_REFRESH_AFTER_MS) return existing;
	}

	let details: ArtistDetails;
	try {
		details = await lookup(source, sourceId);
	} catch (error) {
		if (existing) {
			console.warn(`Keeping stale ${source} artist ${sourceId}: refresh failed`, error);
			return existing;
		}
		throw error;
	}
	return upsertTasteArtist(db, details);
}

export class FavouriteLimitError extends Error {
	constructor(public readonly limit: number) {
		super(`Favourite artists are limited to ${limit}`);
		this.name = 'FavouriteLimitError';
	}
}

/**
 * Links an existing catalogue artist to the user. Returns whether a new link was created
 * (adding the same artist twice is a no-op, not an error).
 */
export async function addFavouriteArtist(
	db: Queryable,
	userId: string,
	artistId: string
): Promise<{ created: boolean }> {
	const inserted = await db.query(
		`INSERT INTO clubfindr.user_favourite_artists (user_id, artist_id)
		 SELECT $1, $2
		 WHERE (SELECT count(*) FROM clubfindr.user_favourite_artists WHERE user_id = $1) < $3
		 ON CONFLICT (user_id, artist_id) DO NOTHING
		 RETURNING artist_id`,
		[userId, artistId, MAX_FAVOURITE_ARTISTS]
	);
	if ((inserted.rowCount ?? 0) > 0) return { created: true };

	// Nothing inserted: either it was already a favourite or the limit was reached
	const existing = await db.query(
		'SELECT 1 FROM clubfindr.user_favourite_artists WHERE user_id = $1 AND artist_id = $2',
		[userId, artistId]
	);
	if (existing.rows.length > 0) return { created: false };
	throw new FavouriteLimitError(MAX_FAVOURITE_ARTISTS);
}

/** Unlinks an artist from the user. Returns whether anything was removed. */
export async function removeFavouriteArtist(
	db: Queryable,
	userId: string,
	artistId: string
): Promise<boolean> {
	const result = await db.query(
		'DELETE FROM clubfindr.user_favourite_artists WHERE user_id = $1 AND artist_id = $2',
		[userId, artistId]
	);
	return (result.rowCount ?? 0) > 0;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value);
}
