import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ROADMAP section 4, docs/section4-inventory.md section 1: no SQL in the web app is built from
// request input. Every value goes in as a `$n` parameter; what is interpolated into SQL text is a
// table or column name from a fixed map, a column list from an allow-list, or a named constant.
// This keeps it that way. A new `${…}` inside an SQL template literal fails here until its
// expression is added to ALLOWED below, with the reason it cannot carry input; SQL built with `+`
// fails outright.
//
// A source check, like no-pooled-transactions.test.ts: an injection is a property of how the
// string is built, which a behavioural test only finds if it happens to send the right input.

const SRC = path.join(import.meta.dirname, '..', '..');

/**
 * Expressions that may appear in SQL text, by file, each with why it is safe. Matched exactly
 * against the trimmed expression inside `${…}`.
 */
const ALLOWED: Record<string, { expressions: string[]; why: string }> = {
	'lib/taste/favouriteArtists.ts': {
		expressions: ['table', 'column'],
		why: 'from scope(owner), a fixed user/bar map that throws on anything else'
	},
	'lib/server/codeAttempts.ts': {
		expressions: ['table', "[...columns, 'confirmation_attempts'].join(', ')"],
		why: "table is the CodeTable type ('bars' | 'users'); columns are literals at every call site"
	},
	'routes/api/bars/[barId]/+server.ts': {
		expressions: ['setClause'],
		why: 'column names from the handler’s fixed allow-list, values as $n'
	},
	'routes/api/mobile/bars/[barId]/+server.ts': {
		expressions: ["setClauses.join(', ')"],
		why: 'only keys found in the handler’s allowedFields list are pushed, values as $n'
	},
	'routes/update-info/+page.server.ts': {
		expressions: ["updates.join(', ')", 'paramCount'],
		why: 'three constant `column = $n` fragments; paramCount is the integer placeholder counter'
	},
	'lib/server/venueLogin.ts': {
		expressions: ['VENUE_COLUMNS'],
		why: 'a module constant listing bars columns; the e-mail and ids go in as $n'
	},
	'routes/api/mobile/bars/stats/+server.ts': {
		expressions: ['timeConstraint'],
		why: 'one of three constant fragments chosen by a switch'
	}
};

/** Named SQL constants, allowed in any file. */
const CONSTANTS = ['BAR_CODE_SECONDS_LEFT_SQL'];

const SQL = /\b(select\b[\s\S]*\bfrom|insert\s+into|update\s+[\w."]+\s+set|delete\s+from)\b/i;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return sourceFiles(full);
		return /\.(ts|js|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
	});
}

/**
 * Every template literal in `source`, with the expressions it interpolates. A small scanner
 * rather than a regex, so `${ fn({ a }) }` and a template nested inside an expression are read
 * whole. Comments are skipped, so a backtick in a comment does not open a literal.
 */
export function templateLiterals(
	source: string
): { text: string; expressions: string[]; line: number }[] {
	const found: { text: string; expressions: string[]; line: number }[] = [];
	let i = 0;
	const lineAt = (index: number) => source.slice(0, index).split('\n').length;

	function readTemplate(): { text: string; expressions: string[] } {
		// at the opening backtick
		i++;
		let text = '';
		const expressions: string[] = [];
		while (i < source.length && source[i] !== '`') {
			if (source[i] === '\\') {
				text += source.slice(i, i + 2);
				i += 2;
			} else if (source[i] === '$' && source[i + 1] === '{') {
				i += 2;
				const start = i;
				let depth = 1;
				while (i < source.length && depth > 0) {
					if (source[i] === '`') {
						const inner = readTemplate();
						found.push({ ...inner, line: lineAt(i) });
						continue;
					}
					if (source[i] === "'" || source[i] === '"') skipString(source[i]);
					else {
						if (source[i] === '{') depth++;
						if (source[i] === '}') depth--;
						i++;
					}
				}
				expressions.push(source.slice(start, i - 1).trim());
				text += '${}';
			} else {
				text += source[i++];
			}
		}
		i++; // closing backtick
		return { text, expressions };
	}

	function skipString(quote: string) {
		i++;
		while (i < source.length && source[i] !== quote && source[i] !== '\n') {
			i += source[i] === '\\' ? 2 : 1;
		}
		i++;
	}

	while (i < source.length) {
		const c = source[i];
		if (c === '/' && source[i + 1] === '/') {
			while (i < source.length && source[i] !== '\n') i++;
		} else if (c === '/' && source[i + 1] === '*') {
			const end = source.indexOf('*/', i + 2);
			i = end === -1 ? source.length : end + 2;
		} else if (c === "'" || c === '"') {
			skipString(c);
		} else if (c === '`') {
			const line = lineAt(i);
			found.push({ ...readTemplate(), line });
		} else {
			i++;
		}
	}
	return found;
}

describe('SQL is never built from strings', () => {
	it('the scanner reads nested expressions whole and skips comments', () => {
		const source = [
			'// `SELECT ${notCode} FROM x`',
			'const q = `SELECT a FROM t WHERE ${fn({ a: `x${y}` })} AND b = $1`;'
		].join('\n');
		const sql = templateLiterals(source).filter((t) => SQL.test(t.text));
		expect(sql.map((t) => t.expressions)).toEqual([['fn({ a: `x${y}` })']]);
	});

	it('interpolates only allow-listed names and constants into SQL text', () => {
		const offenders = sourceFiles(SRC).flatMap((file) => {
			const relative = path.relative(SRC, file).split(path.sep).join('/');
			const allowed = new Set([...(ALLOWED[relative]?.expressions ?? []), ...CONSTANTS]);
			return templateLiterals(readFileSync(file, 'utf8'))
				.filter((t) => SQL.test(t.text))
				.flatMap((t) =>
					t.expressions
						.filter((expression) => !allowed.has(expression))
						.map((expression) => `${relative}:${t.line}: \${${expression}}`)
				);
		});
		expect(
			offenders,
			'pass values as $n parameters; a name or constant that cannot carry input goes in ALLOWED with its reason'
		).toEqual([]);
	});

	it('never concatenates SQL with +', () => {
		const CONCATENATED =
			/(['"`])\s*(select\b[^'"`]*\bfrom|insert\s+into|update\s+[\w."]+\s+set|delete\s+from)\b[^'"`]*\1\s*\+/i;
		const offenders = sourceFiles(SRC).flatMap((file) =>
			readFileSync(file, 'utf8')
				.split('\n')
				.map((line, i) => ({ line, i }))
				.filter(({ line }) => !/^\s*(\/\/|\*)/.test(line) && CONCATENATED.test(line))
				.map(({ line, i }) => `${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`)
		);
		expect(offenders).toEqual([]);
	});
});
