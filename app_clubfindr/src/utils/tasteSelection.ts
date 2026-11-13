/**
 * The genres the Discover tab searches with: the taste profile's genres (from the artists the
 * user picked or imported), cleaned up for the `selected-genres` value TilkiScreen reads.
 * Pure, so it is unit-tested; the screen only renders.
 */
export function genresForSearch(profileGenres: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of profileGenres) {
        // TilkiScreen splits the stored value on commas, so a comma inside a genre would split it
        const genre = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
        const key = genre.toLowerCase();
        if (genre && !seen.has(key)) {
            seen.add(key);
            result.push(genre);
        }
    }
    return result;
}

/** What the Discover tab shows for a profile: nothing to search with yet, or ready to search. */
export function discoverState(profile: { artists: readonly unknown[]; genres: readonly string[] }) {
    const genres = genresForSearch(profile.genres);
    if (profile.artists.length === 0) return { kind: 'empty' as const, genres };
    if (genres.length === 0) return { kind: 'no-genres' as const, genres };
    return { kind: 'ready' as const, genres };
}

/** An artist row on the Search tab. */
export interface SearchArtist {
    id: string;
    name: string;
    genres: string[];
    imageUrl: string | null;
}

/**
 * Taste-search hits (`GET /api/taste/search`, the server-side Spotify app plus the catalogue) as
 * Search tab rows. A hit's id is its provider id, so one artist found twice shows once.
 */
export function artistsFromHits(
    hits: readonly { source: string; sourceId: string; name: string; genres: string[]; imageUrl: string | null }[]
): SearchArtist[] {
    const seen = new Set<string>();
    const rows: SearchArtist[] = [];
    for (const hit of hits) {
        const id = `${hit.source}:${hit.sourceId}`;
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({ id, name: hit.name, genres: hit.genres ?? [], imageUrl: hit.imageUrl ?? null });
    }
    return rows;
}

/** The genres of the selected rows, de-duplicated in order. */
export function genresOfSelection(rows: readonly SearchArtist[], selected: ReadonlySet<string>): string[] {
    return genresForSearch(rows.filter((row) => selected.has(row.id)).flatMap((row) => row.genres));
}
