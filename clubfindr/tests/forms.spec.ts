import { test, expect, acceptCookies, login } from './fixtures';

// Client-side validation and offline behaviour of the account and registration forms.
// Anything that would send an e-mail fails offline and must report that, not crash.
test.describe('forms', () => {
	test('password reset: validates the e-mail, reports the failed send', async ({
		page,
		pageErrors
	}) => {
		await page.goto('/password-reset');
		await acceptCookies(page);
		const form = page.locator('form.reset-form');
		// 'a@b' passes the browser's type=email check but not the app's validator
		await form.locator('#email').fill('a@b');
		await form.locator('button[type="submit"]').click();
		await expect(form.locator('.error-message')).toContainText('valid email');

		await form.locator('#email').fill('listener@clubfindr.test');
		await form.locator('button[type="submit"]').click();
		await expect(page.locator('.error-message, .success-message').first()).toBeVisible();
		expect(pageErrors).toEqual([]);
	});

	test('password reset with token: mismatching passwords are rejected locally', async ({
		page
	}) => {
		await page.goto('/password-reset/not-a-real-token');
		await acceptCookies(page);
		await page.locator('#password').fill('Abcdef1!x');
		await page.locator('#confirmPassword').fill('Abcdef1!y');
		await page.locator('button[type="submit"]').click();
		await expect(page.locator('body')).toContainText('Passwords do not match');
	});

	test('update-info: needs a login, validates password confirmation', async ({ page }) => {
		await login(page, 'listener');
		await page.goto('/update-info');
		await expect(page.locator('body')).toContainText('Update Profile');
		await page.locator('#current-password').fill('Listener#2026');
		await page.locator('#new-password').fill('Abcdef1!x');
		await page.locator('#confirm-password').fill('different');
		await page.locator('button[type="submit"]').click();
		await expect(page.locator('body')).toContainText('New passwords do not match');

		// A form post that reaches the server: wrong current password is rejected by the
		// action (not by the CSRF origin check, which this also exercises)
		await page.locator('#current-password').fill('not-the-password');
		await page.locator('#confirm-password').fill('Abcdef1!x');
		await page.locator('button[type="submit"]').click();
		await expect(page.locator('body')).toContainText('Invalid current password');

		await page.locator('button', { hasText: 'Cancel' }).click();
		await page.waitForURL('**/users-home');
	});

	test('selected genres: custom genres can be added, toggled and removed', async ({
		page,
		pageErrors
	}) => {
		await page.goto('/selectedGenres');
		await acceptCookies(page);
		const input = page.getByPlaceholder('Enter a custom genre');
		const submit = page.locator('.submit-button');

		await page.locator('.add-button').click();
		await expect(page.locator('body')).toContainText('Please enter a genre');

		await input.fill('my custom genre');
		await page.locator('.add-button').click();
		const tag = page.locator('.genre-tag', { hasText: 'my custom genre' });
		await expect(tag).toHaveCount(1);
		await expect(submit).toBeDisabled();
		await tag.locator('input[type="checkbox"]').check();
		await expect(submit).toBeEnabled();

		await input.fill('my custom genre');
		await page.locator('.add-button').click();
		await expect(page.locator('body')).toContainText('already exists');

		await tag.locator('.remove-button').click();
		await expect(tag).toHaveCount(0);
		await expect(submit).toBeDisabled();
		expect(pageErrors).toEqual([]);
	});

	test('delete confirmation: the code request reports the failed e-mail', async ({ page }) => {
		await page.goto('/delete-confirmation');
		await acceptCookies(page);
		page.on('dialog', (dialog) => dialog.dismiss());
		const form = page.locator('form.email-form');
		await form.locator('#email').fill('listener@clubfindr.test');
		await form.locator('button[type="submit"]').click();
		await expect(page.locator('.error-message').first()).toBeVisible();
	});

	test('registration confirmation: resend without a pending registration', async ({ page }) => {
		await page.goto('/register/confirm');
		await acceptCookies(page);
		await page.locator('a', { hasText: 'Resend Code' }).click();
		await expect(page.locator('body')).toContainText(/not found|Failed|try again/i);
	});

	test('users-home: attendance feedback selects and city change', async ({ page, pageErrors }) => {
		await login(page, 'listener');
		const first = page.locator('.additional-content li').first();
		await first.locator('select').first().selectOption('1');
		await expect(first.locator('select')).toHaveCount(2);
		await first.locator('select').nth(1).selectOption('1');

		await page.locator('.change-city-btn').click();
		await page.locator('#city-select').selectOption('London');
		await expect(page.locator('.current-city')).toHaveText('London');
		expect(pageErrors).toEqual([]);
	});
});
