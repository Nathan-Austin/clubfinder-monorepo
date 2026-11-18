import { readFileSync } from 'fs';
import path from 'path';
import { MAX_VENUE_GENRES, genreVocabulary, normalizeGenre, suggestGenres } from '../genreVocabulary';

const vocabulary = genreVocabulary();

describe('genreVocabulary', () => {
  it('offers sorted, unique names', () => {
    expect(vocabulary.length).toBeGreaterThan(1000);
    expect(new Set(vocabulary).size).toBe(vocabulary.length);
    expect([...vocabulary].sort((a, b) => a.localeCompare(b))).toEqual(vocabulary);
  });

  it('sorts and de-duplicates whatever list it is given', () => {
    expect(genreVocabulary({ genres: ['techno', 'Bass', 'techno'] })).toEqual(['Bass', 'techno']);
  });

  // The web dashboard and the app suggest from the same generated list (KNOWN_ISSUES 91), and
  // the server's own test (clubfindr src/lib/taste/genreSuggestions.test.ts) holds that list to
  // what the matcher accepts
  it("offers exactly the names the web dashboard's picker offers", () => {
    const web = JSON.parse(
      readFileSync(path.resolve('..', 'clubfindr', 'static', 'lib', 'genre-suggestions.json'), 'utf8')
    );
    expect(genreVocabulary(web)).toEqual(vocabulary);
  });

  // The device run found these missing: the server accepts them, no picker offered them
  it('offers the plain umbrella terms', () => {
    for (const umbrella of ['House', 'Rock', 'Hip Hop', 'Techno']) {
      expect(vocabulary).toContain(umbrella);
    }
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
