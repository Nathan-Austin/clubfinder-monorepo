import { test, expect } from './fixtures';

/**
 * KNOWN_ISSUES #3: pages whose load() depends on cookies must send a visitor who does not
 * have them to the page that sets them, never to the 500 error page. That is anyone who
 * opens a bookmark, comes back after the one-hour search cookies expired, or was logged out.
 *
 * - /clubs and /barfindr need the city and date from a search on the home page, so they go
 *   back to /. A city cookie without the date counts as no search either (no server-side
 *   "today" fallback: the server's clock is not the visitor's).
 * - /promoter-home needs a promoter login, so it goes to /login/bars (as /bars already does).
 */
const guarded = [
	{ path: '/clubs', target: '/' },
	{ path: '/barfindr', target: '/' },
	{ path: '/promoter-home', target: '/login/bars' }
] as const;

test.describe('pages opened without their cookies', () => {
	for (const { path, target } of guarded) {
		test(`${path} redirects to ${target}`, async ({ page, context }) => {
			// The raw response is a redirect, not an error page
			const response = await context.request.get(path, { maxRedirects: 0 });
			expect.soft(response.status(), `${path} status`).toBeGreaterThanOrEqual(300);
			expect.soft(response.status(), `${path} status`).toBeLessThan(400);
			expect.soft(response.headers()['location'], `${path} location`).toBe(target);

			// And a browser ends up on the target page, rendered normally
			const landing = await page.goto(path);
			expect(landing?.status()).toBe(200);
			await expect(page).toHaveURL(new RegExp(`${target.replace(/\//g, '\\/')}$`));
			await expect(page.locator('body')).not.toContainText('500 Error');
		});
	}

	for (const path of ['/clubs', '/barfindr']) {
		test(`${path} with a city cookie but no date redirects to /`, async ({ context, baseURL }) => {
			await context.addCookies([{ name: 'city', value: 'berlin', url: baseURL! }]);
			const response = await context.request.get(path, { maxRedirects: 0 });
			expect(response.status()).toBeGreaterThanOrEqual(300);
			expect(response.status()).toBeLessThan(400);
			expect(response.headers()['location']).toBe('/');
		});
	}
});
