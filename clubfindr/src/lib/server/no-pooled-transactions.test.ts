import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// KNOWN_ISSUES 39: `query('BEGIN')` … `query('COMMIT')` through $lib/db's query() is not a
// transaction, because query() takes a pooled connection per statement. Every such sequence was
// moved onto withTransaction; this keeps the pattern from coming back.
//
// A source check rather than a behavioural one on purpose: the stranded transaction it leaves is
// only visible while the pool is quiet (tests/transactions.spec.ts shows it when run alone), and
// any concurrent request picks the connection up and hides it — which is how it hid in production.

const SRC = path.join(import.meta.dirname, '..', '..');
// The bare, pooled query( only: `client.query('BEGIN')` on a connection of one's own, as
// withTransaction does, is exactly right.
const TRANSACTION_CONTROL = /(?<![.\w])query\(\s*['"`]\s*(BEGIN|COMMIT|ROLLBACK)\b/i;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return sourceFiles(full);
		return /\.(ts|js|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
	});
}

describe('transactions', () => {
	it('never runs BEGIN, COMMIT or ROLLBACK through the pooled query()', () => {
		const offenders = sourceFiles(SRC).flatMap((file) =>
			readFileSync(file, 'utf8')
				.split('\n')
				.map((line, i) => ({ line, i }))
				// comments that describe the old pattern are fine
				.filter(({ line }) => !/^\s*(\/\/|\*)/.test(line) && TRANSACTION_CONTROL.test(line))
				.map(({ line, i }) => `${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`)
		);
		expect(offenders, 'use withTransaction from $lib/db instead').toEqual([]);
	});
});
