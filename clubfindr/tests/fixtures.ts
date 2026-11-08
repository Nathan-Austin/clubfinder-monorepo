import {
	test as base,
	expect,
	type APIRequest,
	type APIRequestContext,
	type Page
} from '@playwright/test';
import { isFlagEnabled } from '../src/lib/flagValue';

export type { Page };

/**
 * SPOTIFY_CONNECT_ENABLED as the server under test sees it. playwright.config.ts starts the
 * server with this process's environment (node --env-file never overrides it), so
 *   SPOTIFY_CONNECT_ENABLED=false pnpm test
 * runs the whole suite with per-account Spotify connect switched off. Specs that only make
 * sense in one mode skip themselves in the other (see tests/spotify-connect-flag.spec.ts).
 * Parsed with the server's own isFlagEnabled, so "0", "off", "no" … all count as off.
 */
export const SPOTIFY_CONNECT_ENABLED = isFlagEnabled(process.env.SPOTIFY_CONNECT_ENABLED, true);

/**
 * Shared fixture for the e2e suite.
 *
 * - Offline: every request that does not go to the app under test is aborted, so the tests
 *   never depend on Google Maps, reCAPTCHA, Spotify, SoundCloud, Tidal, e-mail, etc.
 * - Each test gets its own `x-forwarded-for` address, which the app's per-IP rate limiter
 *   (60 requests/minute in hooks.server.ts) keys on; without it a parallel run is throttled.
 * - Uncaught page errors fail the test. Console errors from blocked third-party scripts are
 *   expected offline and are not counted.
 * - One session per user: /login/users deletes the user's other sessions, so two tests that
 *   log in as the same user in parallel invalidate each other's session cookie. Page loads
 *   mostly survive this (they also read the usersId cookie), API calls do not. Tests that call
 *   the API as a given user must live in one file with `test.describe.configure({ mode:
 *   'default' })`, and no other file may log in as that user (see tests/taste.spec.ts).
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
	},
	/** Regular user who never connected Spotify; has seeded favourite artists (taste profile) */
	fan: {
		email: 'fan@clubfindr.test',
		password: 'Fan#2026',
		loginPath: '/login/users',
		home: '/users-home'
	},
	/** Regular user who never connected Spotify and has no favourite artists (empty profile) */
	newcomer: {
		email: 'newcomer@clubfindr.test',
		password: 'Newcomer#2026',
		loginPath: '/login/users',
		home: '/users-home'
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
 *
 * With SPOTIFY_CONNECT_ENABLED off there is no such dialog (the dashboard never asks a venue
 * to connect Spotify), so this does nothing and the caller carries on. Prefer
 * openBarDashboard, which also waits for the page to be ready.
 */
export async function dismissSpotifyDialog(page: Page) {
	if (!SPOTIFY_CONNECT_ENABLED) return;
	await page.locator('.modal-backdrop').first().waitFor({ state: 'attached' });
	await page.evaluate(() =>
		document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove())
	);
}

/**
 * Logs in as the bar manager and waits until /bars is ready to be used: the artists picker has
 * finished its own request, which means the page has hydrated and the session cookie is live.
 *
 * Both matter. Clicking before hydration does nothing (the handler is not attached yet), and
 * the first page.request call made straight after login() can go out before the API context
 * has the session cookie, which answers 403 once and then succeeds. Waiting on the Spotify
 * dialog used to hide the first problem, but only while SPOTIFY_CONNECT_ENABLED is on.
 */
export async function openBarDashboard(page: Page) {
	await login(page, 'bar');
	await dismissSpotifyDialog(page);
	await expect(
		page
			.locator(
				'[data-testid="venue-artists"] [data-testid="taste-favourite"], [data-testid="venue-artists"] [data-testid="taste-empty"]'
			)
			.first()
	).toBeVisible();
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

let mobileIpCounter = 0;

/**
 * A request context with no cookies, standing in for the mobile app: only an
 * `Authorization: Bearer` header can authenticate its calls, so a test cannot pass on a
 * browser cookie by accident. It gets its own X-Forwarded-For (the per-IP rate limiter), from
 * a range the browser contexts above never use. Dispose it at the end of the test.
 */
export async function mobileApi(
	playwright: { request: APIRequest },
	baseURL: string | undefined
): Promise<APIRequestContext> {
	mobileIpCounter += 1;
	return playwright.request.newContext({
		baseURL,
		extraHTTPHeaders: {
			'x-forwarded-for': `10.251.${Math.floor(mobileIpCounter / 250) % 250}.${mobileIpCounter % 250}`
		}
	});
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
