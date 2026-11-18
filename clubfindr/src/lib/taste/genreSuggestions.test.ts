// One genre list (KNOWN_ISSUES 91): everything a picker offers must be something the server
// accepts. The suggestions in static/lib/genre-suggestions.json (and the app's copy of it) are
// generated from the cluster tree and the umbrella terms by `pnpm convert-genres`; this test is
// what keeps the generator and the matcher from drifting apart.
//
// Before it, the pickers offered the 1,243 names of unified-genres.json: 15 of them were
// grouping labels the matcher cannot place ("Ambient and Atmospheric Electronic Music"), so a
// suggestion could be refused with "Not genres Clubfindr knows", while plain "house", "rock" and
// "hip hop" — which the matcher has always accepted — were offered by nobody (2026-11-18 run).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import suggestions from '../../../static/lib/genre-suggestions.json';
import { UMBRELLA_FAMILIES } from '$lib/data/genreAliases';
import { isKnownGenre } from './genreClassifier';

const genres: string[] = suggestions.genres;

describe('genre suggestions', () => {
	it('offers a decent list at all', () => {
		expect(genres.length).toBeGreaterThan(1000);
		expect(new Set(genres).size, 'no duplicates').toBe(genres.length);
	});

	it('is accepted by the server, every single entry', () => {
		const refused = genres.filter((genre) => !isKnownGenre(genre));
		expect(refused, 'run `pnpm convert-genres` after changing the clusters or aliases').toEqual([]);
	});

	it('offers the plain umbrella terms people actually type', () => {
		for (const umbrella of ['House', 'Rock', 'Hip Hop', 'Techno', 'Metal', 'Trance']) {
			expect(genres, `${umbrella} must be suggestable`).toContain(umbrella);
		}
	});

	it('offers every umbrella the matcher knows', () => {
		const offered = new Set(genres.map((genre) => genre.toLowerCase()));
		const missing = Object.keys(UMBRELLA_FAMILIES).filter(
			(umbrella) => !offered.has(umbrella.toLowerCase())
		);
		expect(missing, 'run `pnpm convert-genres` after adding an umbrella').toEqual([]);
	});

	// Contents, not bytes: prettier owns the web copy's formatting, the app's is written as the
	// generator left it
	it('is the same list the app ships', () => {
		const appCopy = JSON.parse(
			readFileSync(
				path.resolve(
					import.meta.dirname,
					'../../../../app_clubfindr/src/constants/genre-suggestions.json'
				),
				'utf8'
			)
		);
		expect(appCopy.genres, 'run `pnpm convert-genres` to write both copies').toEqual(genres);
	});
});
