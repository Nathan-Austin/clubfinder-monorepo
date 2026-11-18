import { describe, expect, it } from 'vitest';
import { EventGenresError, MAX_EVENT_GENRES, validateEventGenres } from './eventGenres';

// A stand-in matcher: the real one is server-only, and the point here is the rule, not the tree
const KNOWN = new Set(['techno', 'house', 'uk garage', 'live music']);
const isKnown = (genre: string) => KNOWN.has(genre);

describe('validateEventGenres', () => {
	it('normalises and sorts what it keeps', () => {
		expect(validateEventGenres(['  TECHNO ', 'House', 'techno'], isKnown)).toEqual([
			'house',
			'techno'
		]);
	});

	it('allows an event with no genres', () => {
		expect(validateEventGenres(undefined, isKnown)).toEqual([]);
		expect(validateEventGenres(null, isKnown)).toEqual([]);
		expect(validateEventGenres([], isKnown)).toEqual([]);
	});

	it('refuses genres the matcher does not know, naming them', () => {
		try {
			validateEventGenres(['techno', 'polka-step'], isKnown);
			throw new Error('should have refused');
		} catch (error) {
			expect(error).toBeInstanceOf(EventGenresError);
			expect((error as EventGenresError).message).toBe('Not genres Clubfindr knows: polka-step');
			expect((error as EventGenresError).genres).toEqual(['polka-step']);
		}
	});

	it('refuses anything that is not a list of strings', () => {
		expect(() => validateEventGenres('techno', isKnown)).toThrow(EventGenresError);
		expect(() => validateEventGenres([1, 2], isKnown)).toThrow(EventGenresError);
	});

	it('refuses entries too long to be a genre', () => {
		expect(() => validateEventGenres(['x'.repeat(61)], isKnown)).toThrow(/limited to 60/);
	});

	it('refuses more genres than a night can be about', () => {
		const many = Array.from({ length: MAX_EVENT_GENRES + 1 }, (_, i) => `genre ${i}`);
		expect(() => validateEventGenres(many, () => true)).toThrow(
			`An event is limited to ${MAX_EVENT_GENRES} genres`
		);
	});
});
