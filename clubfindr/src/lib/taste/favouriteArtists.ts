// Favourite artists: the first piece of the manual taste profile (docs/taste-profile-design.md).
//
// A user marks artists as favourites; the artists live in clubfindr.taste_artists with the
// genres the provider reported when they were fetched, and the user's genre profile is the
// plain set of those genres. Everything here takes its database through the `Queryable`
// parameter so it can be unit-tested with a fake; the endpoints pass `pool`.

export const MAX_FAVOURITE_ARTISTS = 50;

/**
 * Whose favourites a call is about. Users and venues keep their favourites in separate
 * tables (clubfindr.user_favourite_artists / clubfindr.bar_favourite_artists) pointing at
 * the same taste_artists catalogue, so an artist looked up once serves both and neither side
 * of a match can overwrite the other's picks.
 *
 * The table and column names are interpolated into SQL, so they come from this closed map
 * only; the owner id itself is always a bound parameter.
 */
export const FAVOURITE_SCOPES = {
	user: { table: 'clubfindr.user_favourite_artists', column: 'user_id' },
	bar: { table: 'clubfindr.bar_favourite_artists', column: 'bar_id' }
} as const;

export type FavouriteOwner = keyof typeof FAVOURITE_SCOPES;

export function isFavouriteOwner(value: unknown): value is FavouriteOwner {
	return typeof value === 'string' && value in FAVOURITE_SCOPES;
}

function scope(owner: FavouriteOwner) {
	const found = FAVOURITE_SCOPES[owner];
	if (!found) throw new Error(`Unknown favourite owner: ${owner}`);
	return found;
}

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
	/**
	 * How many of the favourites carry each genre. Three techno artists out of five make a
	 * mostly-techno profile, which the flat `genres` set cannot say; the matchers normalise
	 * these counts by the largest one (findWeightedClusters, KNOWN_ISSUES 32).
	 */
	genreWeights: Record<string, number>;
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

/**
 * The same profile with how many artists carry each genre. A genre counts once per artist, so
 * an artist tagged with a genre twice does not weigh double.
 */
export function deriveProfileGenreWeights(
	artists: Pick<ArtistDetails, 'genres'>[]
): Record<string, number> {
	const weights: Record<string, number> = {};
	for (const artist of artists) {
		for (const genre of normalizeGenres(artist.genres)) {
			weights[genre] = (weights[genre] ?? 0) + 1;
		}
	}
	return weights;
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
	ownerId: string,
	owner: FavouriteOwner = 'user'
): Promise<FavouriteArtistsProfile> {
	const { table, column } = scope(owner);
	const result = await db.query(
		`SELECT a.id, a.source, a.source_id, a.name, a.genres, a.image_url, a.fetched_at
		 FROM ${table} f
		 JOIN clubfindr.taste_artists a ON a.id = f.artist_id
		 WHERE f.${column} = $1
		 ORDER BY f.created_at ASC, a.name ASC`,
		[ownerId]
	);
	const artists = result.rows.map(rowToTasteArtist);
	return {
		artists,
		genres: deriveProfileGenres(artists),
		genreWeights: deriveProfileGenreWeights(artists)
	};
}

/**
 * The favourites' genres for several owners at once, as `ownerId -> genres`.
 *
 * Venue matching scores many venues in one page load, so it cannot call
 * listFavouriteArtists per venue. Owners with no favourites are simply absent from the map.
 */
export async function listFavouriteGenresForOwners(
	db: Queryable,
	ownerIds: string[],
	owner: FavouriteOwner = 'bar'
): Promise<Map<string, string[]>> {
	const genresByOwner = new Map<string, string[]>();
	const ids = [...new Set(ownerIds.filter(isUuid))];
	if (ids.length === 0) return genresByOwner;

	const { table, column } = scope(owner);
	const result = await db.query(
		`SELECT f.${column} AS owner_id, a.genres
		 FROM ${table} f
		 JOIN clubfindr.taste_artists a ON a.id = f.artist_id
		 WHERE f.${column} = ANY($1)`,
		[ids]
	);

	for (const row of result.rows) {
		const ownerId = String(row.owner_id);
		const existing = genresByOwner.get(ownerId) ?? [];
		genresByOwner.set(ownerId, existing.concat(normalizeGenres(row.genres)));
	}
	// De-duplicate across the owner's artists, keeping a stable order
	for (const [ownerId, genres] of genresByOwner) {
		genresByOwner.set(ownerId, [...new Set(genres)]);
	}
	return genresByOwner;
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

export async function countFavouriteArtists(
	db: Queryable,
	ownerId: string,
	owner: FavouriteOwner = 'user'
): Promise<number> {
	const { table, column } = scope(owner);
	const result = await db.query(
		`SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`,
		[ownerId]
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
	ownerId: string,
	artistId: string,
	owner: FavouriteOwner = 'user'
): Promise<{ created: boolean }> {
	const { table, column } = scope(owner);
	const inserted = await db.query(
		`INSERT INTO ${table} (${column}, artist_id)
		 SELECT $1, $2
		 WHERE (SELECT count(*) FROM ${table} WHERE ${column} = $1) < $3
		 ON CONFLICT (${column}, artist_id) DO NOTHING
		 RETURNING artist_id`,
		[ownerId, artistId, MAX_FAVOURITE_ARTISTS]
	);
	if ((inserted.rowCount ?? 0) > 0) return { created: true };

	// Nothing inserted: either it was already a favourite or the limit was reached
	const existing = await db.query(
		`SELECT 1 FROM ${table} WHERE ${column} = $1 AND artist_id = $2`,
		[ownerId, artistId]
	);
	if (existing.rows.length > 0) return { created: false };
	throw new FavouriteLimitError(MAX_FAVOURITE_ARTISTS);
}

/** Unlinks an artist from the user or venue. Returns whether anything was removed. */
export async function removeFavouriteArtist(
	db: Queryable,
	ownerId: string,
	artistId: string,
	owner: FavouriteOwner = 'user'
): Promise<boolean> {
	const { table, column } = scope(owner);
	const result = await db.query(`DELETE FROM ${table} WHERE ${column} = $1 AND artist_id = $2`, [
		ownerId,
		artistId
	]);
	return (result.rowCount ?? 0) > 0;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value);
}
