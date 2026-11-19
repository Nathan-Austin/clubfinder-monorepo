// The scrape's genre list (KNOWN_ISSUES 94): data_collection/known_genres.json, written by
// `pnpm convert-genres`, names every genre the matcher places without guessing and the
// top-level cluster it lands in. The Spotify step keeps only these on artists and events, and
// judges a Spotify match against the rest of a line-up by cluster, so the file must agree with
// the matcher entry by entry.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import suggestions from '../../../static/lib/genre-suggestions.json';
import { GENRE_ALIASES } from '$lib/data/genreAliases';
import { findClusters, normalizeGenre } from '$lib/server/genreMatching';
import { isKnownGenre } from './genreClassifier';

const file = JSON.parse(
	readFileSync(
		path.resolve(import.meta.dirname, '../../../../data_collection/known_genres.json'),
		'utf8'
	)
) as { genres: Record<string, string> };
const known = file.genres;

describe("the scrape's known genres", () => {
	it('is accepted by the matcher, every entry, in the cluster the matcher gives it', () => {
		const wrong = Object.entries(known)
			.filter(([genre, cluster]) => {
				const [entry] = findClusters([genre]);
				return !entry || entry.cluster === 'Uncategorized' || entry.cluster !== cluster;
			})
			.map(([genre, cluster]) => `${genre} -> ${cluster}`);
		expect(wrong, 'run `pnpm convert-genres` after changing the clusters or aliases').toEqual([]);
	});

	it('covers every suggestion and every alias', () => {
		const missing = [
			...suggestions.genres.map((genre: string) => normalizeGenre(genre)),
			...Object.keys(GENRE_ALIASES).filter((alias) => isKnownGenre(alias))
		].filter((genre) => !(genre in known));
		expect(missing).toEqual([]);
	});

	it("knows the owner's 2026-11-19 case the way the matcher does", () => {
		expect(known['hardcore punk']).toBe('Rock Music');
		expect(known['techno']).toBe('Electronic/Dance (EDM)');
		expect(known['deep house']).toBe('Electronic/Dance (EDM)');
		expect(known['coco']).toBeUndefined();
		expect(known['none']).toBeUndefined();
	});
});
