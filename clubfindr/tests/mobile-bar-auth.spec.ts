import { test, expect, openBarDashboard, mobileApi, bearer, type Page } from './fixtures';
import type { APIRequestContext } from '@playwright/test';

// Writes to a venue through the mobile API need that venue's session token
// ($lib/server/barAuth). They used to accept anyone who knew the bar id. The reads customers
// use for discovery stay public.
//
// Mobile calls go through a separate request context with no cookies, so only the Bearer
// token can authorise them (the dashboard cookie would otherwise let them through). It gets
// its own X-Forwarded-For, like every test context (tests/fixtures.ts), so the per-IP rate
// limiter does not lump it in with other tests.
//
// Logs in as the seeded `bar` user to clean up, so it runs in order with the other files that
// do (tests/bars.spec.ts, tests/venue-taste.spec.ts are each serial; different files never
// share a context).
test.describe.configure({ mode: 'default' });

const BAR_ID = '00000000-0000-4000-8000-0000000000b1';
const UNKNOWN_TOKEN = '99999999-9999-4999-8999-999999999999';
const QR_ID = '88888888-8888-4888-8888-888888888888';

/** Every write the bar screens of the app make, with a body that would otherwise be valid. */
const WRITES = [
	{
		method: 'post',
		path: `/api/mobile/bars/${BAR_ID}/events`,
		data: { theme_name: 'x', event_date: '2031-06-22' }
	},
	{ method: 'patch', path: `/api/mobile/bars/${BAR_ID}`, data: { description: 'x' } },
	{ method: 'post', path: `/api/mobile/bars/${BAR_ID}/qrcodes`, data: { name: 'x' } },
	{ method: 'delete', path: `/api/mobile/bars/${BAR_ID}/qrcodes/${QR_ID}`, data: undefined },
	{ method: 'post', path: `/api/mobile/bars/${BAR_ID}/qrcodes/${QR_ID}/promotion`, data: {} }
] as const;

async function send(api: APIRequestContext, w: (typeof WRITES)[number], headers = {}) {
	return api.fetch(w.path, { method: w.method.toUpperCase(), data: w.data, headers });
}

test('writes to a venue are refused without that venue’s token', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	for (const w of WRITES) {
		expect((await send(api, w)).status(), `${w.method} ${w.path} without a token`).toBe(403);
		expect(
			(await send(api, w, bearer(UNKNOWN_TOKEN))).status(),
			`${w.method} ${w.path} with an unknown token`
		).toBe(403);
	}
	// A malformed id is a 400, not a refusal
	expect(
		(await api.post('/api/mobile/bars/not-a-uuid/events', { data: WRITES[0].data })).status()
	).toBe(400);
	await api.dispose();
});

test('reads used for discovery stay public', async ({ playwright, baseURL }) => {
	const api = await mobileApi(playwright, baseURL);
	expect((await api.get(`/api/mobile/bars/${BAR_ID}/events`)).status()).toBe(200);
	expect((await api.get(`/api/mobile/bars/${BAR_ID}`)).status()).toBe(200);
	await api.dispose();
});

test('the venue’s own token can create an event; the token works straight after login', async ({
	page,
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const loggedIn = await api.post('/api/mobile/bars/login', {
		data: { email: 'bar@clubfindr.test', password: 'BarManager#2026' }
	});
	expect(loggedIn.status()).toBe(200);
	const { token } = await loggedIn.json();

	// The very first request after login: the session row must already exist
	const theme = `Mobile Auth Night ${Date.now()}`;
	const created = await api.post(`/api/mobile/bars/${BAR_ID}/events`, {
		data: { theme_name: theme, event_date: '2031-06-22', start_time: '21:00' },
		headers: bearer(token)
	});
	expect(created.status(), await created.text()).toBe(200);
	const { event } = await created.json();
	expect(event.theme_name).toBe(theme);

	// Customers see it without any token
	const listed = await (await api.get(`/api/mobile/bars/${BAR_ID}/events`)).json();
	expect(listed.events.map((e: { theme_name: string }) => e.theme_name)).toContain(theme);
	await api.dispose();

	// Clean up through the dashboard endpoint (the mobile API has no delete for events)
	await cleanUp(page, event.id);
});

async function cleanUp(page: Page, eventId: string) {
	await openBarDashboard(page);
	expect((await page.request.delete(`/api/bars/${BAR_ID}/events/${eventId}`)).ok()).toBe(true);
}
