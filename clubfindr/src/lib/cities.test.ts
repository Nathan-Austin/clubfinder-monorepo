import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCityName } from '$lib/cityName';
import { LIVE_CITIES, findLiveCity } from './cities';

const LIVE_CITIES_TXT = path.join(
	import.meta.dirname,
	'..',
	'..',
	'..',
	'data_collection',
	'live_cities.txt'
);

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

	it('stores each city the way users.city does', () => {
		for (const city of LIVE_CITIES) expect(city.slug).toBe(normalizeCityName(city.name));
	});

	it('has plausible European coordinates', () => {
		for (const { latitude, longitude } of LIVE_CITIES) {
			expect(latitude).toBeGreaterThan(35);
			expect(latitude).toBeLessThan(65);
			expect(longitude).toBeGreaterThan(-10);
			expect(longitude).toBeLessThan(25);
		}
	});

	it('finds a city by its name or slug, and nothing else', () => {
		expect(findLiveCity('Berlin')?.slug).toBe('berlin');
		expect(findLiveCity(' london ')?.slug).toBe('london');
		expect(findLiveCity('rome')).toBeUndefined();
		expect(findLiveCity(42)).toBeUndefined();
	});
});
