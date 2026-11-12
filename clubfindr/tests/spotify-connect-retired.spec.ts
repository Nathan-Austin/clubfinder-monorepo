import { test, expect, acceptCookies, type Page, testPassword, mobileApi } from './fixtures';
import { capturedMail, waitForMail } from './mail';

// Per-account and per-venue Spotify connect are retired (ROADMAP section 1, KNOWN_ISSUES 24).
// This was tests/spotify-connect-flag.spec.ts while SPOTIFY_CONNECT_ENABLED switched them and the
// suite ran once per mode; the server no longer reads the flag, so everything here runs always.
// Older app builds still send the old fields, and still read spotifyConnectEnabled, so those
// cases stay covered.
//
// Every test uses throwaway accounts and venues with unique e-mails, so nothing here shares a
// session or a row with another spec. Nothing listens where spotify_service did (127.0.0.1:5000),
// so a call to it would fail and show up as a "Spotify Integration" admin mail.

function unique(prefix: string) {
	return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
const PASSWORD = testPassword();

async function signUpWeb(page: Page, email: string, spotifyEmail?: string) {
	return page.request.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			email,
			password: PASSWORD,
			fullName: 'Connect Flag Test',
			spotifyEmail
		}
	});
}

function venue(name: string, email: string, extra: Record<string, unknown> = {}) {
	return {
		businessName: name,
		contactPerson: 'Connect Flag Test',
		email,
		phone: '+49 30 1234567',
		address: 'Teststrasse 1',
		postcode: '10115',
		cityName: 'Berlin',
		website: '',
		password: PASSWORD,
		smokingAllowed: false,
		barTypes: ['club'],
		...extra
	};
}

test.describe('users', () => {
	test('the web signup form has no Spotify e-mail field', async ({ page }) => {
		await page.goto('/login/users');
		await acceptCookies(page);
		const form = page.locator('form.login-form');
		await form.locator('input[type="checkbox"]').check();
		await expect(form.locator('#fullName')).toBeVisible();
		await expect(form.locator('#spotifyEmail')).toHaveCount(0);
		const notice = form.locator('.data-protection-notice');
		await expect(notice).toContainText('The artists you pick');
		await expect(notice).not.toContainText('Spotify');
	});

	test('web signup ignores a Spotify e-mail that is sent anyway', async ({ page }) => {
		// The Spotify e-mail used to be stored and checked for duplicates, so a second account
		// giving the same one was refused ("User already exists"). Now it is neither stored nor
		// checked, so both signups go through: the field really is ignored.
		const spotifyEmail = `${unique('shared-spotify')}@clubfindr.test`;
		const first = await signUpWeb(page, `${unique('web-off-a')}@clubfindr.test`, spotifyEmail);
		expect(first.status()).toBe(200);
		expect(await first.json()).toEqual({ success: true, newAccount: true });

		const second = await signUpWeb(page, `${unique('web-off-b')}@clubfindr.test`, spotifyEmail);
		expect(second.status()).toBe(200);
		expect(await second.json()).toEqual({ success: true, newAccount: true });
	});

	test('mobile signup needs no music service', async ({ page }) => {
		const response = await page.request.post('/api/mobile/signup', {
			data: {
				name: 'Connect Flag Test',
				email: `${unique('mobile-off')}@clubfindr.test`,
				password: PASSWORD
			}
		});
		expect(response.status()).toBe(201);
		expect(await response.json()).toMatchObject({
			success: true,
			requiresEmailVerification: true,
			spotifyConnectEnabled: false
		});
	});

	test('mobile signup ignores a Spotify choice from an older app', async ({ page }) => {
		// requiresSpotifySetup was only answered on the branch that called spotify_service
		// (add_user), so its absence shows there is no such call any more
		const response = await page.request.post('/api/mobile/signup', {
			data: {
				name: 'Connect Flag Test',
				email: `${unique('mobile-off-spotify')}@clubfindr.test`,
				password: PASSWORD,
				musicService: 'spotify',
				spotifyEmail: `${unique('old-app-spotify')}@clubfindr.test`
			}
		});
		expect(response.status()).toBe(201);
		const body = await response.json();
		expect(body).toMatchObject({ success: true, spotifyConnectEnabled: false });
		expect(body).not.toHaveProperty('requiresSpotifySetup');
	});

	test('there are no Spotify connect buttons', async ({ page }) => {
		expect((await signUpWeb(page, `${unique('web-no-connect')}@clubfindr.test`)).status()).toBe(
			200
		);
		for (const path of ['/users-home', '/']) {
			await page.goto(path);
			await acceptCookies(page);
			await expect(page.locator('[aria-label="Login with Spotify"]')).toHaveCount(0);
			await expect(page.getByTestId('spotify-connect')).toHaveCount(0);
		}
		// The page that showed a user's Spotify top artists is gone
		expect((await page.request.get('/spotify')).status()).toBe(404);
	});
});

test.describe('venues and the app config', () => {
	test('the config says Spotify connect is off, with a short cache', async ({ page }) => {
		const response = await page.request.get('/api/mobile/config');
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ spotifyConnectEnabled: false });
		expect(response.headers()['cache-control']).toBe('public, max-age=60');
	});

	test('web venue registration ignores a music service and never calls add_bar', async ({
		page
	}) => {
		const name = unique('Connect Off Bar');
		const email = `${unique('venue-off')}@clubfindr.test`;
		const startedAt = Date.now();
		// POST /register needs a captcha pass now (tests/register-captcha.spec.ts); the mock
		// verifier accepts this token and the response sets the cookie on this context
		const verified = await page.request.post('/api/verify-captcha', {
			data: { recaptchaResponse: 'mock-captcha-ok' }
		});
		expect(verified.status()).toBe(200);
		const response = await page.request.post('/register', {
			data: venue(name, email, {
				musicService: 'Spotify',
				musicServiceEmail: `${unique('venue-spotify')}@clubfindr.test`
			})
		});
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ success: true });

		// The endpoint awaits all its mail before answering, so the capture file is complete
		const admin = await waitForMail(
			(m) =>
				m.subject === 'New Bar Registration' &&
				m.text.includes(name) &&
				Date.parse(m.at) >= startedAt
		);
		expect(admin, 'admin notification for the new venue').toBeDefined();
		expect(admin!.text).not.toContain('Music Service');
		expect(admin!.text).not.toContain('Spotify');
		// With add_bar attempted, the unreachable spotify_service would have produced one of these
		expect(
			capturedMail().filter(
				(m) => m.subject.startsWith('Spotify Integration') && m.text.includes(name)
			)
		).toEqual([]);
		// The owner still gets a confirmation code
		const owner = await waitForMail((m) => m.to === email && Date.parse(m.at) >= startedAt);
		expect(owner?.subject).toBe('Registration Confirmation Code');
	});

	test('mobile venue registration needs no music service', async ({ page }) => {
		const name = unique('Connect Off Mobile Bar');
		const email = `${unique('mobile-venue-off')}@clubfindr.test`;
		const startedAt = Date.now();
		const response = await page.request.post('/api/mobile/bars/register', {
			data: venue(name, email, {
				musicService: 'spotify',
				musicServiceEmail: `${unique('mobile-venue-spotify')}@clubfindr.test`
			})
		});
		expect(response.status()).toBe(200);
		expect(await response.json()).toMatchObject({ success: true });
		// The mail goes out in the background right after the answer (it used to wait 20 s for
		// add_bar), and mentions no music service
		const owner = await waitForMail((m) => m.to === email && Date.parse(m.at) >= startedAt);
		expect(owner?.subject).toBe('Registration Confirmation Code');
		expect(owner!.text).not.toContain('Spotify');
		expect(
			capturedMail().filter(
				(m) => m.subject.startsWith('Spotify Integration') && m.text.includes(name)
			)
		).toEqual([]);
	});
});

test('the Spotify connect routes are gone', async ({ page, playwright, baseURL }) => {
	// Web: the OAuth callback and reauth (users and venues), the venue registration's Spotify
	// landing page, the per-account app lookups
	for (const path of [
		'/spotify',
		'/spotify/login?code=x&state=y',
		'/spotify/reauth',
		'/register/login?code=x',
		'/api/get-spotify-app',
		'/api/get-bar-spotify-app'
	]) {
		expect((await page.request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
	}
	// Mobile: venue connect, and the user endpoints removed before it
	const api = await mobileApi(playwright, baseURL);
	for (const path of [
		'/api/mobile/bars/00000000-0000-4000-8000-000000000001/spotify-connect',
		'/api/mobile/spotify/register',
		'/api/mobile/spotify/genres/process'
	]) {
		expect((await api.post(path, { data: {} })).status(), path).toBe(404);
	}
	// (GET /api/mobile/bars/currently-playing, the venue playback reader, is gone too, but that
	// path now falls through to GET /api/mobile/bars/[barId], so it is not a 404 to assert)
	await api.dispose();
});
