import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowedOrigin, applyCors } from './cors';

const prod = { dev: false, configuredOrigin: 'https://www.clubfindr.com' };
const devServer = { dev: true };

describe('allowedOrigin', () => {
	it('allows the site, apex and www, always', () => {
		expect(allowedOrigin('https://clubfindr.com', prod)).toBe('https://clubfindr.com');
		expect(allowedOrigin('https://www.clubfindr.com', prod)).toBe('https://www.clubfindr.com');
	});

	it('refuses every other origin in production, localhost included', () => {
		for (const origin of [
			'https://evil.example',
			'http://clubfindr.com',
			'https://clubfindr.com.evil.example',
			'https://evilclubfindr.com',
			'http://localhost:3000',
			'null',
			''
		]) {
			expect(allowedOrigin(origin, prod), origin).toBeNull();
		}
		expect(allowedOrigin(null, prod)).toBeNull();
	});

	it('allows localhost and 127.0.0.1 on any port under vite dev only', () => {
		expect(allowedOrigin('http://localhost:5173', devServer)).toBe('http://localhost:5173');
		expect(allowedOrigin('http://127.0.0.1:3000', devServer)).toBe('http://127.0.0.1:3000');
		expect(allowedOrigin('http://localhost', devServer)).toBe('http://localhost');
		expect(allowedOrigin('http://localhost.evil.example', devServer)).toBeNull();
		expect(allowedOrigin('https://evil.example', devServer)).toBeNull();
	});

	it("allows the deployment's own ORIGIN (a local build, the e2e suite)", () => {
		const local = { dev: false, configuredOrigin: 'http://localhost:4173/' };
		expect(allowedOrigin('http://localhost:4173', local)).toBe('http://localhost:4173');
		expect(allowedOrigin('http://localhost:4174', local)).toBeNull();
	});
});

describe('applyCors', () => {
	it('echoes an allowed origin and varies on Origin', () => {
		const headers = new Headers();
		applyCors(headers, 'https://www.clubfindr.com', prod);
		expect(headers.get('Access-Control-Allow-Origin')).toBe('https://www.clubfindr.com');
		expect(headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
		expect(headers.get('Vary')).toBe('Origin');
		expect(headers.get('Access-Control-Allow-Credentials')).toBeNull();
	});

	it('strips any CORS header a route set when the origin is not allowed', () => {
		const headers = new Headers({
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET'
		});
		applyCors(headers, 'https://evil.example', prod);
		expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
		expect(headers.get('Access-Control-Allow-Methods')).toBeNull();
		expect(headers.get('Content-Type')).toBe('application/json');
		expect(headers.get('Vary')).toBe('Origin');
	});
});

// Ported from the parallel branch of 2026-11-14: the headers come from this module only, so a
// route cannot bring the wildcard back on its own (KNOWN_ISSUES 54)
const SRC = path.join(import.meta.dirname, '..', '..');
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		if (statSync(full).isDirectory()) return sourceFiles(full);
		return /\.(ts|js|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
	});
}

describe('CORS headers come from $lib/server/cors only', () => {
	it('no other source file sets Access-Control-Allow-Origin (reading it is fine)', () => {
		const offenders = sourceFiles(SRC)
			.filter((file) => path.relative(SRC, file) !== path.join('lib', 'server', 'cors.ts'))
			.filter((file) =>
				readFileSync(file, 'utf8')
					.split('\n')
					.some(
						(line) =>
							!/^\s*(\/\/|\*)/.test(line) &&
							// set/append calls and header-object keys; reading it (has/get) is fine
							(/\.(set|append)\(\s*['"`]Access-Control-Allow-Origin/i.test(line) ||
								/['"`]Access-Control-Allow-Origin['"`]\s*:/i.test(line))
					)
			)
			.map((file) => path.relative(SRC, file));
		expect(offenders, 'let hooks.server.ts add the headers through applyCors').toEqual([]);
	});
});
