import { describe, expect, it } from 'vitest';
import type { Queryable } from './favouriteArtists';
import {
	DeclaredGenresError,
	listDeclaredGenres,
	listDeclaredGenresForOwners,
	MAX_DECLARED_GENRE_LENGTH,
	MAX_DECLARED_GENRES,
	mergeGenresByOwner,
	setDeclaredGenres
} from './venueGenres';

const BAR_A = '00000000-0000-4000-8000-0000000000b1';
const BAR_B = '00000000-0000-4000-8000-0000000000b2';

/** A Queryable that answers by matching a fragment of the SQL text, recording every call. */
function fakeDb(handlers: Array<[string, (params: unknown[]) => Record<string, unknown>[]]>) {
	const calls: Array<{ text: string; params: unknown[] }> = [];
	const db: Queryable = {
		async query(text, params = []) {
			calls.push({ text, params });
			const handler = handlers.find(([fragment]) => text.includes(fragment));
			if (!handler) throw new Error(`fakeDb: no handler for query: ${text}`);
			const rows = handler[1](params);
			return { rows, rowCount: rows.length };
		}
	};
	return { db, calls };
}

const knowsEverything = () => true;

describe('listDeclaredGenres', () => {
	it('returns the normalized column', async () => {
		const { db } = fakeDb([
			['SELECT declared_genres', () => [{ declared_genres: ['Techno', 'deep  house'] }]]
		]);
		await expect(listDeclaredGenres(db, BAR_A)).resolves.toEqual(['techno', 'deep house']);
	});

	it('is empty for an unknown venue', async () => {
		const { db } = fakeDb([['SELECT declared_genres', () => []]]);
		await expect(listDeclaredGenres(db, BAR_A)).resolves.toEqual([]);
	});
});

describe('setDeclaredGenres', () => {
	it('normalizes, sorts and stores the set, returning it as stored', async () => {
		const { db, calls } = fakeDb([
			['UPDATE clubfindr.bars SET declared_genres', (params) => [{ declared_genres: params[1] }]]
		]);
		await expect(
			setDeclaredGenres(db, BAR_A, ['Techno', ' deep  house ', 'techno'], knowsEverything)
		).resolves.toEqual(['deep house', 'techno']);
		expect(calls[0].params).toEqual([BAR_A, ['deep house', 'techno']]);
	});

	it('accepts an empty list (clearing the declaration)', async () => {
		const { db } = fakeDb([
			['UPDATE clubfindr.bars SET declared_genres', () => [{ declared_genres: [] }]]
		]);
		await expect(setDeclaredGenres(db, BAR_A, [], knowsEverything)).resolves.toEqual([]);
	});

	it('refuses anything that is not an array of strings, before touching the database', async () => {
		const { db, calls } = fakeDb([]);
		await expect(setDeclaredGenres(db, BAR_A, 'techno', knowsEverything)).rejects.toThrow(
			DeclaredGenresError
		);
		await expect(setDeclaredGenres(db, BAR_A, ['techno', 7], knowsEverything)).rejects.toThrow(
			DeclaredGenresError
		);
		expect(calls).toHaveLength(0);
	});

	it('refuses more than the limit', async () => {
		const { db } = fakeDb([]);
		const tooMany = Array.from({ length: MAX_DECLARED_GENRES + 1 }, (_, i) => `genre ${i}`);
		await expect(setDeclaredGenres(db, BAR_A, tooMany, knowsEverything)).rejects.toThrow(
			`limited to ${MAX_DECLARED_GENRES}`
		);
	});

	it('refuses an entry longer than a genre can be', async () => {
		const { db } = fakeDb([]);
		const longGenre = 'x'.repeat(MAX_DECLARED_GENRE_LENGTH + 1);
		await expect(setDeclaredGenres(db, BAR_A, [longGenre], knowsEverything)).rejects.toThrow(
			DeclaredGenresError
		);
	});

	it('refuses genres the classifier does not know, naming them', async () => {
		const { db, calls } = fakeDb([]);
		const knowsTechno = (genre: string) => genre === 'techno';
		const error = await setDeclaredGenres(db, BAR_A, ['Techno', 'Polka-Metal'], knowsTechno).catch(
			(e: DeclaredGenresError) => e
		);
		expect(error).toBeInstanceOf(DeclaredGenresError);
		expect((error as DeclaredGenresError).genres).toEqual(['polka-metal']);
		expect(calls).toHaveLength(0);
	});

	it('reports an unknown venue', async () => {
		const { db } = fakeDb([['UPDATE clubfindr.bars SET declared_genres', () => []]]);
		await expect(setDeclaredGenres(db, BAR_A, ['techno'], knowsEverything)).rejects.toThrow(
			'Unknown venue'
		);
	});
});

describe('listDeclaredGenresForOwners', () => {
	it('maps each venue to its normalized genres in one query', async () => {
		const { db, calls } = fakeDb([
			[
				'FROM clubfindr.bars',
				() => [
					{ id: BAR_A, declared_genres: ['Techno', 'techno', 'Soul'] },
					{ id: BAR_B, declared_genres: ['ambient'] }
				]
			]
		]);
		const byBar = await listDeclaredGenresForOwners(db, [BAR_A, BAR_B]);
		expect(byBar.get(BAR_A)).toEqual(['techno', 'soul']);
		expect(byBar.get(BAR_B)).toEqual(['ambient']);
		expect(calls).toHaveLength(1);
		expect(calls[0].params).toEqual([[BAR_A, BAR_B]]);
	});

	it('asks nothing without a usable id and skips non-uuids', async () => {
		const { db, calls } = fakeDb([]);
		await expect(listDeclaredGenresForOwners(db, [])).resolves.toEqual(new Map());
		await expect(listDeclaredGenresForOwners(db, ['not-a-uuid'])).resolves.toEqual(new Map());
		expect(calls).toHaveLength(0);
	});
});

describe('mergeGenresByOwner', () => {
	it('unions the maps per venue, de-duplicated', () => {
		const artists = new Map([
			[BAR_A, ['techno', 'deep house']],
			[BAR_B, ['ambient']]
		]);
		const declared = new Map([[BAR_A, ['soul', 'techno']]]);
		const merged = mergeGenresByOwner(artists, declared);
		expect(merged.get(BAR_A)).toEqual(['techno', 'deep house', 'soul']);
		expect(merged.get(BAR_B)).toEqual(['ambient']);
	});

	it('keeps venues that appear in only one map', () => {
		const merged = mergeGenresByOwner(new Map(), new Map([[BAR_B, ['jazz']]]));
		expect(merged.get(BAR_B)).toEqual(['jazz']);
		expect(merged.size).toBe(1);
	});
});
