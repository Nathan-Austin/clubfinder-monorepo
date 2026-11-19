/**
 * The genres a venue can pick from: the one genre list (KNOWN_ISSUES 91), generated from the
 * server's own cluster tree and umbrella terms by `pnpm convert-genres` and shipped to both
 * sides (`clubfindr/static/lib/genre-suggestions.json` and the copy next door). Everything in
 * it is something the server accepts, so a suggestion can no longer be refused with "Not genres
 * Clubfindr knows"; plain "House", "Rock" and "Hip Hop" are in it too, which the old list
 * (flattened from unified-genres.json) left out.
 *
 * The server stores genres lower-cased and has the final say
 * (`PUT /api/venues/:barId/taste/genres`).
 */
import suggestions from '../constants/genre-suggestions.json';

/** The server's limit on a venue's declared genres (`MAX_DECLARED_GENRES`) */
export const MAX_VENUE_GENRES = 15;

/** Every name a picker may suggest, sorted, without duplicates. */
export function genreVocabulary(list: { genres?: string[] } = suggestions): string[] {
  const names = new Set<string>(list.genres ?? []);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** How the server compares genres: lower case, trimmed, single spaces (`normalizeGenres`). */
export function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Whether the server would accept this genre: it is in the one genre list, in any case. */
export function isKnownGenre(genre: string, vocabulary: readonly string[]): boolean {
  const wanted = normalizeGenre(genre);
  return vocabulary.some((name) => normalizeGenre(name) === wanted);
}

/** The chosen genres the server would refuse, in the order chosen (KNOWN_ISSUES 91). */
export function unknownGenres(genres: readonly string[], vocabulary: readonly string[]): string[] {
  return genres.filter((genre) => !isKnownGenre(genre, vocabulary));
}

/**
 * Up to `limit` suggestions for what has been typed, leaving out genres already chosen: names
 * that start with it first, then names that contain it, each in alphabetical order.
 */
export function suggestGenres(
  query: string,
  chosen: readonly string[],
  vocabulary: readonly string[],
  limit = 8
): string[] {
  const typed = normalizeGenre(query);
  if (!typed) return [];
  const taken = new Set(chosen.map(normalizeGenre));
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of vocabulary) {
    const normalized = normalizeGenre(name);
    if (taken.has(normalized)) continue;
    if (normalized.startsWith(typed)) starts.push(name);
    else if (normalized.includes(typed)) contains.push(name);
  }
  return [...starts, ...contains].slice(0, limit);
}
