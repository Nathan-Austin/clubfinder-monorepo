import { test, expect, mobileApi } from './fixtures';
import type { APIRequestContext, APIResponse } from '@playwright/test';

// /api/* answers browsers from the site's own origins only (KNOWN_ISSUES 54, fixed 2026-11-14).
// Every /api/* response used to carry `Access-Control-Allow-Origin: *`, so any site could read
// the API's answers from its visitors' browsers. Now the header echoes https://clubfindr.com,
// https://www.clubfindr.com or the deployment's own ORIGIN (here the e2e server's), and nothing
// else; a request without an Origin, like the native app's, is served as before.

const FOREIGN = 'https://evil.example';
const SITE = 'https://www.clubfindr.com';

const allowOrigin = (response: APIResponse) => response.headers()['access-control-allow-origin'];

async function withApi(
	playwright: { request: import('@playwright/test').APIRequest },
	baseURL: string | undefined,
	run: (api: APIRequestContext) => Promise<void>
) {
	const api = await mobileApi(playwright, baseURL);
	try {
		await run(api);
	} finally {
		await api.dispose();
	}
}

test('a foreign origin gets the answer without any CORS header', async ({
	playwright,
	baseURL
}) => {
	await withApi(playwright, baseURL, async (api) => {
		const response = await api.get('/api/mobile/config', { headers: { Origin: FOREIGN } });
		expect(response.status()).toBe(200);
		expect(allowOrigin(response)).toBeUndefined();
		expect(response.headers()['vary']).toContain('Origin');

		// A route that set its own wildcard on every answer, the 400 included
		const bars = await api.post('/api/mobile/bars', { data: {}, headers: { Origin: FOREIGN } });
		expect(allowOrigin(bars)).toBeUndefined();
	});
});

test("the site's origins and the deployment's own are echoed back", async ({
	playwright,
	baseURL
}) => {
	await withApi(playwright, baseURL, async (api) => {
		for (const origin of [SITE, 'https://clubfindr.com', new URL(baseURL!).origin]) {
			const response = await api.get('/api/mobile/config', { headers: { Origin: origin } });
			expect(allowOrigin(response), origin).toBe(origin);
			expect(response.headers()['access-control-allow-credentials'], origin).toBeUndefined();
		}
	});
});

test('without an Origin, as from the native app, nothing changes', async ({
	playwright,
	baseURL
}) => {
	await withApi(playwright, baseURL, async (api) => {
		const response = await api.get('/api/mobile/config');
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ spotifyConnectEnabled: false });
		expect(allowOrigin(response)).toBeUndefined();
	});
});

test('preflights are answered for the site only', async ({ playwright, baseURL }) => {
	await withApi(playwright, baseURL, async (api) => {
		const preflight = (origin: string) =>
			api.fetch('/api/taste/artists', {
				method: 'OPTIONS',
				headers: {
					Origin: origin,
					'Access-Control-Request-Method': 'POST',
					'Access-Control-Request-Headers': 'content-type'
				}
			});

		const foreign = await preflight(FOREIGN);
		expect(foreign.status()).toBe(204);
		expect(allowOrigin(foreign)).toBeUndefined();
		expect(foreign.headers()['access-control-allow-methods']).toBeUndefined();

		const site = await preflight(SITE);
		expect(site.status()).toBe(204);
		expect(allowOrigin(site)).toBe(SITE);
		expect(site.headers()['access-control-allow-methods']).toContain('POST');
		expect(site.headers()['access-control-max-age']).toBe('86400');
	});
});
