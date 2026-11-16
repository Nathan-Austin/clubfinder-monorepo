import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * KNOWN_ISSUES #6: the reset link must be built from the origin of the request that
 * issued the token. A hard-coded https://www.clubfindr.com sends every other deployment's
 * users (staging, a local build, a future domain) to production, where their token is unknown.
 */
vi.mock('$lib/db', () => ({ query: vi.fn() }));
vi.mock('$lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

import { POST } from '../routes/api/request-password-reset/+server';
import { query } from '$lib/db';
import { sendEmail } from '$lib/email';

function requestReset(origin: string, email: string) {
	const url = new URL('/api/request-password-reset', origin);
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email })
	});
	return POST({ request, url } as RequestEvent);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(query)
		// SELECT id FROM users: the address exists
		.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-1' }] } as never)
		// INSERT INTO password_resets
		.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never)
		// SELECT FROM bars: no venue login under this address
		.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
});

describe('POST /api/request-password-reset', () => {
	it('links to the origin the request came from, not to a hard-coded domain', async () => {
		const response = await requestReset('https://staging.example.test', 'listener@clubfindr.test');
		expect(response.status).toBe(200);

		expect(sendEmail).toHaveBeenCalledTimes(1);
		const [to, subject, text] = vi.mocked(sendEmail).mock.calls[0];
		expect(to).toBe('listener@clubfindr.test');
		expect(subject).toMatch(/password reset/i);
		const links = text.match(/https?:\/\/\S+/g) ?? [];
		expect(links, 'exactly one link in the message').toHaveLength(1);
		expect(links[0]).toMatch(/^https:\/\/staging\.example\.test\/password-reset\/[0-9a-f]{64}$/);
		expect(text).not.toContain('clubfindr.com');
	});

	it('keeps the scheme and port of a plain-http local origin', async () => {
		await requestReset('http://localhost:4173', 'listener@clubfindr.test');
		const [, , text] = vi.mocked(sendEmail).mock.calls[0];
		expect(text).toMatch(/http:\/\/localhost:4173\/password-reset\/[0-9a-f]{64}/);
	});

	// KNOWN_ISSUES 68: a venue's own login (bars.password_hash) gets a reset link too
	it('sends a venue login its own link', async () => {
		vi.mocked(query)
			.mockReset()
			.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never) // no personal account
			.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'bar-1', name: 'Club' }] } as never)
			.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never); // INSERT bar_password_resets
		const response = await requestReset('https://staging.example.test', 'bar@clubfindr.test');
		expect(response.status).toBe(200);
		expect(vi.mocked(query).mock.calls[2][0]).toContain('bar_password_resets');
		const [, , text] = vi.mocked(sendEmail).mock.calls[0];
		expect(text.match(/https?:\/\/\S+/g)).toHaveLength(1);
	});

	it('labels one link per account when a person and a venue share the address', async () => {
		vi.mocked(query)
			.mockReset()
			.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-1' }] } as never)
			.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never)
			.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'bar-1', name: 'Club' }] } as never)
			.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);
		await requestReset('https://staging.example.test', 'both@clubfindr.test');
		const [, , text] = vi.mocked(sendEmail).mock.calls[0];
		expect(text.match(/https?:\/\/\S+/g)).toHaveLength(2);
		expect(text).toContain('Your personal account:');
		expect(text).toContain('The venue login of Club:');
	});

	it('sends nothing to an address with no account', async () => {
		vi.mocked(query)
			.mockReset()
			.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never)
			.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
		const response = await requestReset('https://staging.example.test', 'nobody@clubfindr.test');
		expect(response.status).toBe(200);
		expect(sendEmail).not.toHaveBeenCalled();
	});
});
