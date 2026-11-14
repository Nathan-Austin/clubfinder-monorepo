import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ROADMAP section 4, docs/section4-inventory.md section 5: handlers logged request bodies, SQL
// parameters, returned rows, e-mail addresses and token fragments, which put personal data and
// credentials in the pm2 logs. Those were removed on 2026-11-14; this keeps them out.
//
// Every console.* call in the source is read whole, its literal text dropped (a message may say
// "e-mail" all it likes), and what is left, the values actually logged, must not name any of
// the identifiers below. A source check, like no-pooled-transactions.test.ts: a log line only
// shows up in a test if the test happens to read the logs.

const SRC = path.join(import.meta.dirname, '..', '..');

const PERSONAL =
	/\b(email|normalizedEmail|general_email|generalEmail|password|newPassword|currentPassword|password_hash|hashedPassword|token|accessToken|access_token|refreshToken|refresh_token|resetToken|sessionId|session_id|confirmationCode|confirmation_code|body)\b|\.rows\[/;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return sourceFiles(full);
		return /\.(ts|js|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
	});
}

/** The argument text of every console.* call in `source`, with the line it starts on. */
export function consoleCalls(source: string): { args: string; line: number }[] {
	const calls: { args: string; line: number }[] = [];
	const start = /\bconsole\.(log|info|warn|error|debug)\(/g;
	for (let match; (match = start.exec(source));) {
		let i = start.lastIndex;
		let depth = 1;
		while (i < source.length && depth > 0) {
			const c = source[i];
			if (c === "'" || c === '"' || c === '`') {
				// skip the literal, template expressions included
				i++;
				while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
			} else if (c === '(') depth++;
			else if (c === ')') depth--;
			i++;
		}
		calls.push({
			args: source.slice(start.lastIndex, i - 1),
			line: source.slice(0, match.index).split('\n').length
		});
	}
	return calls;
}

/** The values a call logs: string literals dropped, template literals reduced to their ${…}. */
export function loggedValues(args: string): string {
	return args
		.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, ' ')
		.replace(/`(?:[^`\\]|\\.)*`/g, (template) =>
			[...template.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' ')
		);
}

describe('logs carry no personal data', () => {
	it('the reader drops literal text and keeps the logged values', () => {
		const [plain, template, object] = consoleCalls(
			[
				"console.log('Sending the e-mail', count);",
				'console.log(`Sent to ${email} in ${ms}ms`);',
				"console.error('Failed:', { status: res.status, body: await res.text() });"
			].join('\n')
		);
		expect(PERSONAL.test(loggedValues(plain.args))).toBe(false);
		expect(loggedValues(template.args).trim()).toBe('email ms');
		expect(PERSONAL.test(loggedValues(object.args))).toBe(true);
	});

	it('no console call logs an e-mail, a password, a token, a code, a body or a row', () => {
		const offenders = sourceFiles(SRC).flatMap((file) =>
			consoleCalls(readFileSync(file, 'utf8'))
				.filter(({ args }) => PERSONAL.test(loggedValues(args)))
				.map(({ args, line }) => `${path.relative(SRC, file)}:${line}: console.…(${args.trim()})`)
		);
		expect(offenders, 'log that something happened, not who it happened to').toEqual([]);
	});
});
