import { expect, type APIRequestContext } from '@playwright/test';

/** hooks.server.ts: 60 requests per minute per client address. */
export const LIMIT = 60;

/**
 * Sends LIMIT + 1 requests to /robots.txt (answered in hooks.server.ts right after the
 * limiter, so it is cheap) with the headers `headers(i)` produces, and returns the statuses.
 */
export async function hammer(
	request: APIRequestContext,
	headers: (i: number) => Record<string, string>
) {
	const statuses: number[] = [];
	for (let i = 0; i <= LIMIT; i++) {
		statuses.push((await request.get('/robots.txt', { headers: headers(i) })).status());
	}
	return statuses;
}

/** /health must answer even for an address whose bucket is exhausted. */
export async function expectHealthExempt(
	request: APIRequestContext,
	headers: Record<string, string>
) {
	expect((await request.get('/health', { headers })).status()).toBe(200);
}
