import { test, expect, acceptCookies, USERS } from './fixtures';
import { waitForMail } from './mail';

/**
 * KNOWN_ISSUES #6: the password reset e-mail hard-codes https://www.clubfindr.com instead of
 * the origin the request came from, so a link made by any other deployment (staging, a local
 * build, a future domain) points at production, where the token does not exist.
 *
 * The test server runs with the capture transport (see tests/mail.ts), so the message is read
 * from the capture file: it must have been captured, never handed to an SMTP server.
 */
test.describe('password reset e-mail', () => {
	test('is captured and links to the origin the request came from', async ({
		page,
		baseURL,
		pageErrors
	}) => {
		const email = USERS.listener.email;
		const requestedAt = Date.now();

		await page.goto('/password-reset');
		await acceptCookies(page);
		const form = page.locator('form.reset-form');
		await form.locator('#email').fill(email);
		await form.locator('button[type="submit"]').click();
		// The request succeeds without any mail server: the transport is the capture file
		await expect(page.locator('.success-message')).toBeVisible();

		const mail = await waitForMail((m) => m.to === email && Date.parse(m.at) >= requestedAt);
		expect(mail, `a captured message to ${email}`).toBeDefined();
		expect(mail!.subject).toMatch(/password reset/i);

		const links = mail!.text.match(/https?:\/\/\S+/g) ?? [];
		expect(links, 'exactly one link in the message').toHaveLength(1);
		const link = links[0] ?? '';
		// The link must point at the site that issued the token, not at production
		expect(link).toMatch(new RegExp(`^${baseURL}/password-reset/[0-9a-f]{64}$`));
		expect(mail!.text).not.toContain('clubfindr.com/');

		// The link works against the server that produced it
		const opened = await page.goto(link);
		expect(opened?.status()).toBe(200);
		await expect(page.locator('#password')).toBeVisible();
		expect(pageErrors).toEqual([]);
	});
});
