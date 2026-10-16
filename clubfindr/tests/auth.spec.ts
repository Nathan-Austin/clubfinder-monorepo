import { test, expect, login, acceptCookies, USERS } from './fixtures';

test.describe('login', () => {
	test('regular user lands on /users-home', async ({ page, pageErrors }) => {
		await login(page, 'listener');
		await expect(page.locator('.welcome-text')).toContainText('Welcome, Lena Listener!');
		// Seeded interested events and the settings menu are there
		await expect(page.locator('.additional-content li').first()).toContainText('Halle Nimbus');
		await page.locator('.settings-button').click();
		await expect(page.locator('.dropdown-menu.visible')).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test('promoter lands on /promoter-home', async ({ page }) => {
		await login(page, 'promoter');
		await expect(page.locator('h1')).toContainText('Promoter Dashboard');
		await expect(page.locator('body')).toContainText('Parallax Cellar');
	});

	test('bar manager lands on /bars', async ({ page }) => {
		await login(page, 'bar');
		await expect(page.locator('h1').first()).toContainText("The Copper Lantern's Music Insights");
		// Offline there is no Spotify session, so the dashboard asks to reconnect
		await expect(page.getByText('Spotify Authentication Required')).toBeVisible();
	});

	test('wrong password shows an error and stays on the form', async ({ page }) => {
		await page.goto(USERS.listener.loginPath);
		await acceptCookies(page);
		const form = page.locator('form.login-form');
		await form.locator('input[type="email"]').fill(USERS.listener.email);
		await form.locator('input[type="password"]').fill('not-the-password');
		await form.locator('button[type="submit"]').click();
		await expect(page.locator('.error-message').first()).toContainText('Invalid credentials');
		await expect(page).toHaveURL(/\/login\/users$/);
	});

	test('logout returns to the public site', async ({ page }) => {
		await login(page, 'listener');
		await page.goto('/logout');
		await page.goto('/update-info');
		await expect(page.locator('body')).not.toContainText('Update Profile');
	});
});
