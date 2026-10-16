import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared fixture for the e2e suite.
 *
 * - Offline: every request that does not go to the app under test is aborted, so the tests
 *   never depend on Google Maps, reCAPTCHA, Spotify, SoundCloud, Tidal, e-mail, etc.
 * - Each test gets its own `x-forwarded-for` address, which the app's per-IP rate limiter
 *   (60 requests/minute in hooks.server.ts) keys on; without it a parallel run is throttled.
 * - Uncaught page errors fail the test. Console errors from blocked third-party scripts are
 *   expected offline and are not counted.
 */

export const USERS = {
	listener: {
		email: 'listener@clubfindr.test',
		password: 'Listener#2026',
		loginPath: '/login/users',
		home: '/users-home'
	},
	promoter: {
		email: 'promoter@clubfindr.test',
		password: 'Promoter#2026',
		loginPath: '/login/bars',
		home: '/promoter-home'
	},
	bar: {
		email: 'bar@clubfindr.test',
		password: 'BarManager#2026',
		loginPath: '/login/bars',
		home: '/bars'
	}
} as const;

export type Role = keyof typeof USERS;

let ipCounter = 0;

export const test = base.extend<{ pageErrors: string[] }>({
	context: async ({ context, baseURL }, use, testInfo) => {
		const origin = new URL(baseURL!).origin;
		await context.route('**/*', (route) => {
			const url = route.request().url();
			if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) {
				return route.continue();
			}
			return route.abort('blockedbyclient');
		});
		ipCounter += 1;
		await context.setExtraHTTPHeaders({
			'x-forwarded-for': `10.${testInfo.workerIndex % 250}.${Math.floor(ipCounter / 250) % 250}.${ipCounter % 250}`
		});
		await use(context);
	},
	pageErrors: async ({ page }, use) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await use(errors);
		expect(errors, 'uncaught errors in the page').toEqual([]);
	}
});

export { expect };

/** Accepts the cookie banner if it is showing; it overlays the bottom of every page. */
export async function acceptCookies(page: Page) {
	const button = page.locator('.consent-banner button', { hasText: 'Accept All' });
	if (await button.count()) {
		// dispatchEvent: the registration pages put a reCAPTCHA overlay over everything
		await button.first().dispatchEvent('click');
		await expect(page.locator('.consent-banner')).toHaveCount(0);
	}
}

/** Logs in through the real form and waits for the landing page. */
export async function login(page: Page, role: Role) {
	const user = USERS[role];
	await page.goto(user.loginPath);
	await acceptCookies(page);
	const form = page.locator('form').first();
	await form.locator('input[type="email"]').fill(user.email);
	await form.locator('input[type="password"]').fill(user.password);
	await form.locator('button[type="submit"]').click();
	await page.waitForURL(`**${user.home}`);
}

/**
 * Offline, the bar dashboard shows a "Spotify Authentication Required" dialog whose only
 * button redirects to Spotify. It covers the page, so the tests remove its backdrop.
 */
export async function dismissSpotifyDialog(page: Page) {
	await page.locator('.modal-backdrop').first().waitFor({ state: 'attached' });
	await page.evaluate(() =>
		document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove())
	);
}

/** On the home page: pick a city, open the genre picker and select one genre by name. */
export async function chooseCityAndGenre(page: Page, city: string, genre: string) {
	await page.goto('/');
	await acceptCookies(page);
	// Geolocation is unavailable offline, so the page falls back to the city list
	await page.locator('#city-select').selectOption(city);
	await page.locator('input.custom-genre-input').click();
	const menu = page.locator('.dropdown-menu');
	await expect(menu).toBeVisible();
	await menu.getByPlaceholder('Search genres...').fill(genre);
	await menu.locator('button', { hasText: genre }).first().click();
	await expect(page.locator('input[name="selectedGenre"]')).toHaveValue(new RegExp(genre));
	return menu;
}
