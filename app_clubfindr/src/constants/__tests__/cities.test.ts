import { readFileSync } from 'fs';
import path from 'path';
import { LIVE_CITIES, cityName, cityToPropose, distanceKm, findLiveCity, nearestLiveCity } from '../cities';

// Jest runs from the app's root (package.json)
const LIVE_CITIES_TXT = path.resolve('..', 'data_collection', 'live_cities.txt');

describe('LIVE_CITIES', () => {
  it('lists exactly the cities data_collection scrapes, in its order', () => {
    const scraped = readFileSync(LIVE_CITIES_TXT, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, , country] = line.split(' - ').map((part) => part.trim());
        return { name, country };
      });
    expect(LIVE_CITIES.map(({ name, country }) => ({ name, country }))).toEqual(scraped);
  });

  it('matches the web app\'s list', () => {
    const web = readFileSync(path.resolve('..', 'clubfindr', 'src', 'lib', 'cities.ts'), 'utf8');
    for (const c of LIVE_CITIES) {
      expect(web).toContain(
        `{ name: '${c.name}', slug: '${c.slug}', country: '${c.country}', latitude: ${c.latitude}, longitude: ${c.longitude} }`
      );
    }
  });
});

describe('findLiveCity / cityName', () => {
  it('finds by name or slug', () => {
    expect(findLiveCity('Paris')?.slug).toBe('paris');
    expect(findLiveCity(' stockholm ')?.name).toBe('Stockholm');
    expect(findLiveCity('rome')).toBeUndefined();
    expect(findLiveCity(undefined)).toBeUndefined();
  });

  it('shows a stored slug as its name, and anything else as it is', () => {
    expect(cityName('london')).toBe('London');
    expect(cityName('new_york')).toBe('new_york');
    expect(cityName(null)).toBe('');
  });
});

describe('nearestLiveCity', () => {
  it('proposes the city a phone is in or near', () => {
    // Kreuzberg, Berlin
    expect(nearestLiveCity({ latitude: 52.4986, longitude: 13.4033 })?.city.slug).toBe('berlin');
    // Shoreditch, London
    expect(nearestLiveCity({ latitude: 51.5265, longitude: -0.0798 })?.city.slug).toBe('london');
    // San Antonio, the other side of Ibiza
    expect(nearestLiveCity({ latitude: 38.9806, longitude: 1.3036 })?.city.slug).toBe('ibiza');
  });

  it('tells Rotterdam and Amsterdam apart', () => {
    expect(nearestLiveCity({ latitude: 51.9225, longitude: 4.4792 })?.city.slug).toBe('rotterdam');
    expect(nearestLiveCity({ latitude: 52.37, longitude: 4.89 })?.city.slug).toBe('amsterdam');
  });

  it('proposes nothing far from every covered city', () => {
    // Lisbon is ~500 km from Madrid
    expect(nearestLiveCity({ latitude: 38.7223, longitude: -9.1393 })).toBeUndefined();
  });

  it('measures distance in km', () => {
    const [london, , , , , , , paris] = LIVE_CITIES;
    expect(Math.round(distanceKm(london, paris))).toBeGreaterThan(330);
    expect(Math.round(distanceKm(london, paris))).toBeLessThan(350);
  });
});

describe('cityToPropose', () => {
  const paris = findLiveCity('paris');
  it('offers the city the phone is in when the account says another', () => {
    expect(cityToPropose('london', paris, false)?.slug).toBe('paris');
    expect(cityToPropose(null, paris, false)?.slug).toBe('paris');
  });
  it('offers nothing when already there, nowhere near, or said no before', () => {
    expect(cityToPropose('paris', paris, false)).toBeUndefined();
    expect(cityToPropose('Paris', paris, false)).toBeUndefined();
    expect(cityToPropose('london', undefined, false)).toBeUndefined();
    expect(cityToPropose('london', paris, true)).toBeUndefined();
  });
});
