import { describe, expect, it } from 'vitest';
import type { Queryable } from './favouriteArtists';
import {
	countFavouriteArtists,
	needsOnboarding,
	ONBOARDING_MAX_ARTISTS,
	ONBOARDING_MIN_ARTISTS
} from './onboarding';

const USER = '00000000-0000-4000-8000-000000000001';

function fakeDb(rows: Record<string, unknown>[]) {
	const calls: Array<{ text: string; params: unknown[] }> = [];
	const db: Queryable = {
		async query(text, params = []) {
			calls.push({ text, params });
			return { rows, rowCount: rows.length };
		}
	};
	return { db, calls };
}

describe('onboarding limits', () => {
	it('asks for 3 to 5 artists', () => {
		expect(ONBOARDING_MIN_ARTISTS).toBe(3);
		expect(ONBOARDING_MAX_ARTISTS).toBe(5);
	});
});

describe('countFavouriteArtists', () => {
	it("counts the user's favourites with a parameterised query", async () => {
		const { db, calls } = fakeDb([{ n: 4 }]);
		expect(await countFavouriteArtists(db, USER)).toBe(4);
		expect(calls).toHaveLength(1);
		expect(calls[0].text).toContain('clubfindr.user_favourite_artists');
		expect(calls[0].params).toEqual([USER]);
	});

	it('reads a bigint count that node-pg returns as a string', async () => {
		const { db } = fakeDb([{ n: '7' }]);
		expect(await countFavouriteArtists(db, USER)).toBe(7);
	});

	it('treats a missing or unreadable row as zero', async () => {
		expect(await countFavouriteArtists(fakeDb([]).db, USER)).toBe(0);
		expect(await countFavouriteArtists(fakeDb([{ n: 'x' }]).db, USER)).toBe(0);
	});
});

describe('needsOnboarding', () => {
	it('is true below the minimum and false from it on, with no upper bound', () => {
		expect(needsOnboarding(0)).toBe(true);
		expect(needsOnboarding(ONBOARDING_MIN_ARTISTS - 1)).toBe(true);
		expect(needsOnboarding(ONBOARDING_MIN_ARTISTS)).toBe(false);
		expect(needsOnboarding(ONBOARDING_MAX_ARTISTS + 20)).toBe(false);
	});
});
