// The cities clubfindr covers: the ones data_collection scrapes (data_collection/live_cities.txt,
// "Name - Code - Country"), with the coordinates of each city centre, which the file does not
// carry. cities.test.ts fails when the two lists differ, so a city added to the scrape must be
// added here (and in app_clubfindr/src/constants/cities.ts, checked the same way).
//
// `slug` is how users.city and events store a city ($lib/cityName.normalizeCityName).

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

/** The covered city for a stored or typed name ("Berlin", "berlin"), or undefined. */
export function findLiveCity(value: unknown): LiveCity | undefined {
	if (typeof value !== 'string') return undefined;
	const slug = value.trim().toLowerCase().replace(/\s+/g, '_');
	return LIVE_CITIES.find((city) => city.slug === slug);
}
