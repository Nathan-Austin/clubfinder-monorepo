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
