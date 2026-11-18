// The genres on a venue's own event (`bar_events.special_genres`), checked the way a venue's
// declared genres are (KNOWN_ISSUES 91, "then strict event genres").
//
// Until now event genres were free text: the app and the dashboard suggested from the shared
// list but accepted anything typed, and whatever arrived was stored. A genre no cluster knows
// sits on the event doing nothing — it cannot match a listener, so the night it describes
// reaches nobody, silently. The event form suggests exactly what is accepted now
// (static/lib/genre-suggestions.json, src/lib/taste/genreSuggestions.test.ts), so a refusal
// means a genuine typo or an invented genre, and the message names it.
//
// The caller passes the classifier, so this module stays unit-testable without the server-only
// matcher — as venueGenres does.

import { normalizeGenres } from './favouriteArtists';

/** As many as a night can honestly be about; the same cap the venue's own list has. */
export const MAX_EVENT_GENRES = 15;

/** Matches the picker's longest entries with room to spare; anything longer is not a genre. */
export const MAX_EVENT_GENRE_LENGTH = 60;

export class EventGenresError extends Error {
	constructor(
		message: string,
		/** The entries that caused it, for the client to point at. */
		public readonly genres: string[] = []
	) {
		super(message);
		this.name = 'EventGenresError';
	}
}

/**
 * The genres to store for an event: normalised (lower case, trimmed, de-duplicated) and every
 * one of them a genre the matcher knows. Missing or empty means "no genres", which is allowed —
 * a venue need not describe every night.
 */
export function validateEventGenres(
	genres: unknown,
	isKnown: (genre: string) => boolean
): string[] {
	if (genres === undefined || genres === null) return [];
	if (!Array.isArray(genres) || genres.some((genre) => typeof genre !== 'string')) {
		throw new EventGenresError('Genres must be an array of strings');
	}

	const tooLong = genres.filter((genre) => genre.length > MAX_EVENT_GENRE_LENGTH);
	if (tooLong.length > 0) {
		throw new EventGenresError(
			`Genres are limited to ${MAX_EVENT_GENRE_LENGTH} characters`,
			tooLong
		);
	}

	const normalized = normalizeGenres(genres).sort();
	if (normalized.length > MAX_EVENT_GENRES) {
		throw new EventGenresError(`An event is limited to ${MAX_EVENT_GENRES} genres`);
	}

	const unknown = normalized.filter((genre) => !isKnown(genre));
	if (unknown.length > 0) {
		throw new EventGenresError(`Not genres Clubfindr knows: ${unknown.join(', ')}`, unknown);
	}

	return normalized;
}
