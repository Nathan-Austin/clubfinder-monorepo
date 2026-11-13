import { artistsFromHits, discoverState, genresForSearch, genresOfSelection } from '../tasteSelection';

describe('genresForSearch', () => {
    it('trims, drops blanks and duplicates (case-insensitively), keeping the first spelling', () => {
        expect(genresForSearch([' Deep House ', 'techno', '', 'deep house', 'Techno', 'minimal']))
            .toEqual(['Deep House', 'techno', 'minimal']);
    });

    it('never lets a comma split a genre in the stored list', () => {
        expect(genresForSearch(['soul, funk', 'r&b'])).toEqual(['soul funk', 'r&b']);
    });
});

describe('discoverState', () => {
    it('asks for artists when the profile is empty', () => {
        expect(discoverState({ artists: [], genres: [] }).kind).toBe('empty');
    });

    it('notices artists without genres', () => {
        expect(discoverState({ artists: [{}], genres: [' '] }).kind).toBe('no-genres');
    });

    it('is ready with the cleaned genres', () => {
        expect(discoverState({ artists: [{}], genres: ['house', 'House'] })).toEqual({
            kind: 'ready',
            genres: ['house']
        });
    });
});

describe('artistsFromHits and genresOfSelection', () => {
    const hits = [
        { source: 'spotify', sourceId: 'a1', name: 'Juno Paperplane', genres: ['deep house', 'minimal'], imageUrl: null },
        { source: 'spotify', sourceId: 'a1', name: 'Juno Paperplane', genres: ['deep house'], imageUrl: null },
        { source: 'lastfm', sourceId: 'x', name: 'Velvet Meridian', genres: ['italo disco', 'Deep House'], imageUrl: 'u' }
    ];

    it('keys rows by provider and id and drops repeats', () => {
        const rows = artistsFromHits(hits);
        expect(rows.map((row) => row.id)).toEqual(['spotify:a1', 'lastfm:x']);
        expect(rows[1].imageUrl).toBe('u');
    });

    it('collects the genres of the selected rows only', () => {
        const rows = artistsFromHits(hits);
        expect(genresOfSelection(rows, new Set(['spotify:a1', 'lastfm:x']))).toEqual([
            'deep house',
            'minimal',
            'italo disco'
        ]);
        expect(genresOfSelection(rows, new Set(['lastfm:x']))).toEqual(['italo disco', 'Deep House']);
        expect(genresOfSelection(rows, new Set())).toEqual([]);
    });
});
