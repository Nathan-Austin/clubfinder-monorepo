// Genre fallback for picked artists (KNOWN_ISSUES 21, ROADMAP section 1).
//
// The taste profile is only as good as the genres behind each artist, and a Spotify artist
// object can come back with `genres: []` — for lesser-known acts today, and for everyone if
// Spotify ever drops the field. When that happens we ask Last.fm for the artist's top tags,
// and MusicBrainz for its tags if Last.fm has none, before giving up.
//
// Last.fm first: its folksonomy covers club genres far better than MusicBrainz's sparser
// tags, and it answers with a relevance scale we already know how to read. MusicBrainz is the
// backstop that needs no API key.
//
// Where this runs: only when an artist is added (POST /api/taste/artists, through
// withGenreFallback below), where the result is written to clubfindr.taste_artists and reused
// for 30 days. Never during search, which would mean one or two extra requests per hit.
//
// A fallback must never stop someone adding an artist, so every provider failure is logged
// and swallowed; the artist is simply stored with no genres, exactly as before.

import type { ArtistDetails, ArtistLookup } from './favouriteArtists';
import {
	MAX_GENRES_PER_ARTIST,
	fetchTopTags,
	tagsToGenres,
	type GenreClassifier,
	type LastfmOptions
} from './lastfm';
import {
	MIN_MUSICBRAINZ_TAG_COUNT,
	fetchMusicbrainzTags,
	type MusicbrainzOptions
} from './musicbrainz';

/** Which provider the genres on an artist came from. */
export type GenreSource = 'provider' | 'lastfm' | 'musicbrainz' | 'none';

export interface GenreFallbackDeps {
	classify: GenreClassifier;
	/** null when LASTFM_API_KEY is not configured: the step is skipped. */
	lastfm?: LastfmOptions | null;
	/** null to switch MusicBrainz off; it needs no key, so it is on by default. */
	musicbrainz?: MusicbrainzOptions | null;
	limit?: number;
	/** Injected by the tests to capture what would be logged. */
	warn?: (message: string, error: unknown) => void;
}

export interface GenreFallbackResult {
	genres: string[];
	source: GenreSource;
}

/**
 * Genres for an artist the provider gave none for: Last.fm top tags, then MusicBrainz tags.
 * Returns the provider's own genres untouched when it had any.
 */
export async function resolveGenresWithFallback(
	details: ArtistDetails,
	deps: GenreFallbackDeps
): Promise<GenreFallbackResult> {
	if (details.genres.length > 0) return { genres: details.genres, source: 'provider' };

	const limit = deps.limit ?? MAX_GENRES_PER_ARTIST;
	const warn = deps.warn ?? ((message: string, error: unknown) => console.warn(message, error));

	if (deps.lastfm) {
		try {
			const tags = await fetchTopTags(details.name, deps.lastfm);
			const genres = tagsToGenres(tags, details.name, deps.classify, limit);
			if (genres.length > 0) return { genres, source: 'lastfm' };
		} catch (error) {
			warn(`Last.fm genre fallback failed for "${details.name}":`, error);
		}
	}

	if (deps.musicbrainz !== null) {
		try {
			const tags = await fetchMusicbrainzTags(details.name, deps.musicbrainz ?? {});
			const genres = tagsToGenres(
				tags,
				details.name,
				deps.classify,
				limit,
				MIN_MUSICBRAINZ_TAG_COUNT
			);
			if (genres.length > 0) return { genres, source: 'musicbrainz' };
		} catch (error) {
			warn(`MusicBrainz genre fallback failed for "${details.name}":`, error);
		}
	}

	return { genres: [], source: 'none' };
}

/**
 * Wraps an ArtistLookup so an artist that arrives without genres gets them from the fallback
 * chain. The shape is unchanged, so resolveTasteArtist stores and caches the result as usual.
 */
export function withGenreFallback(lookup: ArtistLookup, deps: GenreFallbackDeps): ArtistLookup {
	return async (source, sourceId) => {
		const details = await lookup(source, sourceId);
		if (details.genres.length > 0) return details;
		const { genres } = await resolveGenresWithFallback(details, deps);
		return genres.length > 0 ? { ...details, genres } : details;
	};
}
