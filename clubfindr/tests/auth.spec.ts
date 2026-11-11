import {
	test,
	expect,
	login,
	acceptCookies,
	USERS,
	SPOTIFY_CONNECT_ENABLED,
	testPassword
} from './fixtures';

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
		if (SPOTIFY_CONNECT_ENABLED) {
			// Offline there is no Spotify session, so the dashboard asks to reconnect
			await expect(page.getByText('Spotify Authentication Required')).toBeVisible();
		} else {
			// With connect off a venue is never asked for Spotify (KNOWN_ISSUES 4)
			await expect(page.getByText('Spotify Authentication Required')).toHaveCount(0);
		}
		// Either way the venue manages its events and artists
		await expect(page.getByTestId('venue-artists')).toBeVisible();
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

	test('password field can be shown and hidden without submitting', async ({ page }) => {
		await page.goto(USERS.listener.loginPath);
		await acceptCookies(page);
		const form = page.locator('form.login-form');
		const field = form.locator('#password');
		await field.fill('typed-secret');
		await expect(field).toHaveAttribute('type', 'password');

		await form.getByRole('button', { name: 'Show password' }).click();
		await expect(field).toHaveAttribute('type', 'text');
		await expect(field).toHaveValue('typed-secret');

		await form.getByRole('button', { name: 'Hide password' }).click();
		await expect(field).toHaveAttribute('type', 'password');
		await expect(field).toHaveValue('typed-secret');
		// The toggle is type="button", so the form was not submitted
		await expect(page).toHaveURL(/\/login\/users$/);
		await expect(page.locator('.error-message')).toHaveCount(0);
	});

	test('logout returns to the public site', async ({ page }) => {
		await login(page, 'listener');
		await page.goto('/logout');
		await page.goto('/update-info');
		await expect(page.locator('body')).not.toContainText('Update Profile');
	});

	// The browser forgetting its cookie is not the same as the server ending the session:
	// hooks.server.ts caches a session for up to five minutes, so logout has to evict it too or a
	// copied session id keeps working (KNOWN_ISSUES 41). A throwaway account, so this cannot end
	// a seeded user's session under a parallel test.
	test('logout ends the session on the server, not just in this browser', async ({ page }) => {
		const email = `logout-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;
		const signup = await page.request.post('/login/users', {
			data: {
				provider: 'local',
				isNewUser: true,
				email,
				password: testPassword(),
				fullName: 'Logout Check'
			}
		});
		expect(signup.status()).toBe(200);
		await page.goto('/update-info'); // puts the session in the cache
		await expect(page.locator('body')).toContainText('Update Profile');
		const sessionId = (await page.context().cookies()).find((c) => c.name === 'sessionId')!.value;

		await page.goto('/logout');

		const replay = await page.request.get('/update-info', {
			headers: { cookie: `sessionId=${sessionId}` }
		});
		expect(await replay.text()).not.toContain('Update Profile');
	});

	// user_sessions.user_id is UNIQUE, and the session row used to be replaced with a DELETE
	// followed by an INSERT: two logins by the same user at the same moment (two devices, or a
	// double submit) raced, and whichever INSERT lost answered 500 to a valid login. It is one
	// upsert now. Posting the form directly, since this is about concurrent requests rather
	// than the page.
	test('two logins at the same moment both succeed', async ({ page }) => {
		const { email, password } = USERS.listener;
		const data = { provider: 'local', email, password };
		const [first, second] = await Promise.all([
			page.request.post('/login/users', { data }),
			page.request.post('/login/users', { data })
		]);
		expect([first.status(), second.status()]).toEqual([200, 200]);
		expect([(await first.json()).success, (await second.json()).success]).toEqual([true, true]);
	});
});
