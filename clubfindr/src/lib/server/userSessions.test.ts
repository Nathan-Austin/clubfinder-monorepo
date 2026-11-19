import { describe, expect, it, vi } from 'vitest';
import { openUserSession } from './userSessions';

// One session per device (KNOWN_ISSUES 95): a login inserts its own row. On a database that
// still carries the old UNIQUE (user_id), the insert's unique violation falls back to replacing
// the account's one row, so a login never answers 500 for a missing migration.

type Call = { text: string; params: unknown[] };

function fakeDb(onInsert: () => void) {
	const calls: Call[] = [];
	return {
		calls,
		query: vi.fn(async (text: string, params: unknown[] = []) => {
			calls.push({ text, params });
			if (/INSERT INTO clubfindr\.user_sessions/.test(text)) onInsert();
			return { rows: [], rowCount: 0 };
		})
	};
}

describe('openUserSession', () => {
	it('drops the stale rows, then inserts a row of its own', async () => {
		const db = fakeDb(() => undefined);
		await openUserSession(db, 'sid-1', 'user-1', 'berlin', new Date('2026-11-19T10:00:00Z'));
		expect(db.calls.map((call) => call.text.trim().split(/\s+/)[0])).toEqual(['DELETE', 'INSERT']);
		expect(db.calls[1].params).toEqual(['sid-1', 'user-1', 'berlin', '2026-11-19T10:00:00.000Z']);
	});

	it('falls back to replacing the one row where the old constraint still exists', async () => {
		const violation = Object.assign(new Error('duplicate key'), {
			code: '23505',
			constraint: 'unique_user_id'
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const db = fakeDb(() => {
			throw violation;
		});
		await openUserSession(db, 'sid-2', 'user-1', null);
		expect(db.calls.map((call) => call.text.trim().split(/\s+/)[0])).toEqual([
			'DELETE',
			'INSERT',
			'UPDATE'
		]);
		expect(db.calls[2].params[0]).toBe('sid-2');
		expect(db.calls[2].params[3]).toBe('user-1');
		warn.mockRestore();
	});

	it('lets any other failure through', async () => {
		const db = fakeDb(() => {
			throw Object.assign(new Error('connection lost'), { code: '08006' });
		});
		await expect(openUserSession(db, 'sid-3', 'user-1', null)).rejects.toThrow('connection lost');
	});
});
