import { readFileSync } from 'fs';
import path from 'path';
import { MAX_VENUE_GENRES, genreVocabulary, normalizeGenre, suggestGenres } from '../genreVocabulary';

const vocabulary = genreVocabulary();

describe('genreVocabulary', () => {
  it('flattens the genre tree into sorted, unique names', () => {
    expect(vocabulary.length).toBeGreaterThan(1000);
    expect(new Set(vocabulary).size).toBe(vocabulary.length);
    expect([...vocabulary].sort((a, b) => a.localeCompare(b))).toEqual(vocabulary);
  });

  it('takes sub-cluster names, leaf genres and the deeper level', () => {
    const tree = {
      categories: [
        {
          subgenres: [
            { name: 'Minimal and Techno', genres: ['techno', 'minimal techno'] },
            { name: 'Bass', subsubgenres: [{ name: 'UK Bass', genres: ['uk garage'] }] },
          ],
        },
      ],
    };
    expect(genreVocabulary(tree)).toEqual(['Bass', 'Minimal and Techno', 'minimal techno', 'techno', 'UK Bass', 'uk garage']);
  });

  // The web dashboard suggests from clubfindr/static/lib/unified-genres.json; a venue should be
  // offered the same names on both
  it("offers exactly the names the web dashboard's picker offers", () => {
    const web = JSON.parse(
      readFileSync(path.resolve('..', 'clubfindr', 'static', 'lib', 'unified-genres.json'), 'utf8')
    );
    expect(genreVocabulary(web)).toEqual(vocabulary);
  });

  it("matches the server's limit of 15 declared genres", () => {
    const server = readFileSync(path.resolve('..', 'clubfindr', 'src', 'lib', 'taste', 'venueGenres.ts'), 'utf8');
    expect(server).toContain(`export const MAX_DECLARED_GENRES = ${MAX_VENUE_GENRES};`);
  });
});

describe('normalizeGenre', () => {
  it('compares the way the server stores genres', () => {
    expect(normalizeGenre('  UK   Garage ')).toBe('uk garage');
  });
});

describe('suggestGenres', () => {
  const names = ['Deep House', 'house', 'Tech House', 'techno', 'Acid Techno', 'soul'];

  it('puts names starting with the text before names containing it', () => {
    expect(suggestGenres('tech', [], names)).toEqual(['Tech House', 'techno', 'Acid Techno']);
  });

  it('ignores case and spacing', () => {
    expect(suggestGenres('  DEEP  ', [], names)).toEqual(['Deep House']);
  });

  it('leaves out genres already chosen, whatever their case', () => {
    expect(suggestGenres('house', ['HOUSE'], names)).toEqual(['Deep House', 'Tech House']);
  });

  it('suggests nothing for empty text', () => {
    expect(suggestGenres('   ', [], names)).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(suggestGenres('e', [], names, 2)).toHaveLength(2);
  });

  it('finds real genres in the shipped vocabulary', () => {
    expect(suggestGenres('techno', [], vocabulary).map(normalizeGenre)).toContain('techno');
  });
});
