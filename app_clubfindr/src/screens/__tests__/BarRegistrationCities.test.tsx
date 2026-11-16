/**
 * The venue registration offers exactly the covered cities (data_collection/live_cities.txt).
 * It had its own list, with Rome and New York (not scraped) and without Rotterdam, Ibiza and
 * Stockholm.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { LIVE_CITIES } from '../../constants/cities';

const source = readFileSync(path.resolve('src', 'screens', 'BarRegistrationScreen.tsx'), 'utf8');

describe('BarRegistrationScreen cities', () => {
  it('takes its city list from constants/cities.ts', () => {
    expect(source).toMatch(/const cityOptions = LIVE_CITIES\.map\(\(city\) => city\.name\);/);
  });

  it('names no city outside the covered ones', () => {
    for (const stray of ['Rome', 'New York']) {
      expect(source).not.toMatch(new RegExp(`['"]${stray}['"]`));
    }
  });

  it('covers Rotterdam, Ibiza and Stockholm', () => {
    const names = LIVE_CITIES.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Rotterdam', 'Ibiza', 'Stockholm']));
    expect(names).not.toEqual(expect.arrayContaining(['Rome']));
  });
});
