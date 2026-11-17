/**
 * The genres a venue can pick from: the same vocabulary the web dashboard's "Genres you play"
 * suggests (`clubfindr/static/lib/unified-genres.json`, flattened to sub-cluster names and leaf
 * genres). The app's `constants/unified-genres.json` holds the same names; a test keeps them so.
 *
 * The server only accepts genres its cluster matcher knows and stores them lower-cased
 * (`PUT /api/venues/:barId/taste/genres`), so this list is for suggestions; the server decides.
 */
import unified from '../constants/unified-genres.json';

/** The server's limit on a venue's declared genres (`MAX_DECLARED_GENRES`) */
export const MAX_VENUE_GENRES = 15;

type GenreTree = {
  categories?: {
    subgenres?: {
      name?: string;
      genres?: string[];
      subsubgenres?: { name?: string; genres?: string[] }[];
    }[];
  }[];
};

/** Every name the web's picker suggests, sorted, without duplicates. */
export function genreVocabulary(tree: GenreTree = unified as GenreTree): string[] {
  const names = new Set<string>();
  for (const category of tree.categories ?? []) {
    for (const sub of category.subgenres ?? []) {
      if (sub.name) names.add(sub.name);
      for (const genre of sub.genres ?? []) names.add(genre);
      for (const subsub of sub.subsubgenres ?? []) {
        if (subsub.name) names.add(subsub.name);
        for (const genre of subsub.genres ?? []) names.add(genre);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** How the server compares genres: lower case, trimmed, single spaces (`normalizeGenres`). */
export function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim().replace(/\s+/g, ' ');
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
