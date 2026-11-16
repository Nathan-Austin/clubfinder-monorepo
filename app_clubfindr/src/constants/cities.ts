/**
 * The cities clubfindr covers, with their centre coordinates: the ones data_collection scrapes
 * (data_collection/live_cities.txt). The same list as the web's clubfindr/src/lib/cities.ts;
 * src/constants/__tests__/cities.test.ts fails when either drifts from the scrape list.
 *
 * `slug` is how the server stores a city (users.city, events).
 */
export type LiveCity = {
  name: string;
  slug: string;
  country: string;
  latitude: number;
  longitude: number;
};

export const LIVE_CITIES: readonly LiveCity[] = [
  { name: 'London', slug: 'london', country: 'uk', latitude: 51.5074, longitude: -0.1278 },
  { name: 'Berlin', slug: 'berlin', country: 'de', latitude: 52.52, longitude: 13.405 },
  { name: 'Amsterdam', slug: 'amsterdam', country: 'nl', latitude: 52.3676, longitude: 4.9041 },
  { name: 'Rotterdam', slug: 'rotterdam', country: 'nl', latitude: 51.9244, longitude: 4.4777 },
  { name: 'Barcelona', slug: 'barcelona', country: 'es', latitude: 41.3874, longitude: 2.1686 },
  { name: 'Ibiza', slug: 'ibiza', country: 'es', latitude: 38.9067, longitude: 1.4206 },
  { name: 'Madrid', slug: 'madrid', country: 'es', latitude: 40.4168, longitude: -3.7038 },
  { name: 'Paris', slug: 'paris', country: 'fr', latitude: 48.8566, longitude: 2.3522 },
  { name: 'Stockholm', slug: 'stockholm', country: 'se', latitude: 59.3293, longitude: 18.0686 }
];

/** The covered city for a stored or typed name ("Berlin", "berlin", "new york"), or undefined */
export function findLiveCity(value: unknown): LiveCity | undefined {
  if (typeof value !== 'string') return undefined;
  const slug = value.trim().toLowerCase().replace(/\s+/g, '_');
  return LIVE_CITIES.find((city) => city.slug === slug);
}

/** Display name for a stored city, falling back to the stored text itself */
export function cityName(value: string | null | undefined): string {
  return findLiveCity(value)?.name ?? value ?? '';
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Proposing a city from where the phone is only makes sense near one: someone in Lisbon is not
 * "in" Madrid (500 km away). Generous, since coarse location is 1-3 km off and a city's clubs
 * spread well beyond its centre (Ibiza's are across the island).
 */
export const NEAREST_CITY_MAX_KM = 100;

/** The covered city nearest to a position, if one is within NEAREST_CITY_MAX_KM */
export function nearestLiveCity(position: {
  latitude: number;
  longitude: number;
}): { city: LiveCity; km: number } | undefined {
  let best: { city: LiveCity; km: number } | undefined;
  for (const city of LIVE_CITIES) {
    const km = distanceKm(position, city);
    if (!best || km < best.km) best = { city, km };
  }
  return best && best.km <= NEAREST_CITY_MAX_KM ? best : undefined;
}

/**
 * Which city to offer someone whose phone is near `nearest` while their account says
 * `current`: none when they are already there, when no covered city is near, or when they said
 * no to that city before.
 */
export function cityToPropose(
  current: string | null | undefined,
  nearest: LiveCity | undefined,
  dismissed: boolean
): LiveCity | undefined {
  if (!nearest || dismissed) return undefined;
  return findLiveCity(current)?.slug === nearest.slug ? undefined : nearest;
}
