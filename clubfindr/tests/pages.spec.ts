import { test, expect, acceptCookies } from './fixtures';

const publicPages = [
	['/', 'Discover by Genre'],
	['/about/us', 'Who we are'],
	['/about/contact', 'Contact'],
	['/about/terms', ''],
	['/about/blog', ''],
	['/policies/privacy-policy', 'Privacy Policy'],
	['/policies/cookie-policy', 'Cookie Policy'],
	['/policies/terms-and-conditions', 'Terms and Conditions'],
	['/login/users', 'Login'],
	['/login/bars', ''],
	['/register', 'Register'],
	['/register/promoter', 'Promoter Registration'],
	['/password-reset', 'Reset'],
	['/selectedGenres', 'Genres'],
	['/confirm-bar', ''],
	['/delete-confirmation', 'Delete']
] as const;

test.describe('public pages', () => {
	for (const [path, text] of publicPages) {
		test(`${path} renders and hydrates`, async ({ page, pageErrors }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);
			await acceptCookies(page);
			// The client-side router is up once the inline start script has run
			await expect
				.poll(() =>
					page.evaluate(() => Object.keys(window).some((k) => k.startsWith('__sveltekit')))
				)
				.toBe(true);
			if (text) await expect(page.locator('body')).toContainText(text);
			expect(pageErrors).toEqual([]);
		});
	}

	test('layout: navigation and cookie consent', async ({ page }) => {
		await page.goto('/about/us');
		await expect(page.locator('.consent-banner')).toBeVisible();
		await page.locator('.consent-banner button', { hasText: 'Learn more and customize' }).click();
		await expect(page.getByText('Customize Cookie Preferences')).toBeVisible();
		await page.getByRole('button', { name: /Save Preferences/ }).click();
		await expect(page.locator('.consent-banner')).toHaveCount(0);

		const partners = page.locator('.nav-link.dropdown', { hasText: 'Partners' });
		await partners.hover();
		await expect(partners.locator('a', { hasText: 'Partner Login' })).toBeVisible();
		await expect(partners.locator('a', { hasText: 'Register Bar' })).toBeVisible();
	});

	test('layout: mobile menu with submenus', async ({ page }) => {
		await page.setViewportSize({ width: 480, height: 900 });
		await page.goto('/about/us');
		await acceptCookies(page);
		await page.locator('.hamburger').click();
		await expect(page.locator('.main-menu')).toBeVisible();
		await page.locator('.main-menu .nav-item', { hasText: 'Partners' }).click();
		const submenu = page.locator('.submenu.active');
		await expect(submenu.locator('a', { hasText: 'Register as Promoter' })).toBeVisible();
		await submenu.locator('button', { hasText: 'Back' }).click();
		await expect(page.locator('.submenu.active')).toHaveCount(0);
		await page.locator('.hamburger').click();
		await expect(page.locator('.main-menu')).toBeHidden();
	});

	test('protected pages when logged out', async ({ page }) => {
		const updateInfo = await page.goto('/update-info');
		expect(updateInfo?.status()).toBe(401);
		await page.goto('/bars');
		await expect(page).toHaveURL(/\/login\/bars$/);
	});

	test('robots.txt is served', async ({ request }) => {
		// own address: header-less requests share one rate-limit bucket (tests/rate-limit.spec.ts)
		const response = await request.get('/robots.txt', {
			headers: { 'x-forwarded-for': '192.0.2.1' }
		});
		expect(response.status()).toBe(200);
		expect(await response.text()).toContain('User-agent');
	});
});
