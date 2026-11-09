import {
	test,
	expect,
	acceptCookies,
	SPOTIFY_CONNECT_ENABLED,
	type Page,
	testPassword
} from './fixtures';
import { capturedMail, waitForMail } from './mail';

// SPOTIFY_CONNECT_ENABLED (src/lib/featureFlags.ts, KNOWN_ISSUES 24). The suite runs once per
// mode: `pnpm test` with the flag unset (on), and `SPOTIFY_CONNECT_ENABLED=false pnpm test`
// (see tests/fixtures.ts). Each describe block skips itself in the other mode.
//
// Every test uses throwaway accounts and venues with unique e-mails, so nothing here shares a
// session or a row with another spec. Nothing listens where spotify_service would (127.0.0.1:
// 5000), and the "on" tests below never send a Spotify e-mail, so no test reaches it.

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

test.describe('with Spotify connect on (default)', () => {
	test.skip(!SPOTIFY_CONNECT_ENABLED, 'SPOTIFY_CONNECT_ENABLED is off');

	test('the mobile config reports it', async ({ page }) => {
		const response = await page.request.get('/api/mobile/config');
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ spotifyConnectEnabled: true });
	});

	test('mobile signup still requires a music service', async ({ page }) => {
		const response = await page.request.post('/api/mobile/signup', {
			data: {
				name: 'Connect Flag Test',
				email: `${unique('mobile-on')}@clubfindr.test`,
				password: PASSWORD
			}
		});
		expect(response.status()).toBe(400);
		expect(await response.json()).toMatchObject({
			success: false,
			message: 'Missing required fields'
		});
	});
});

test.describe('with Spotify connect off', () => {
	test.skip(SPOTIFY_CONNECT_ENABLED, 'SPOTIFY_CONNECT_ENABLED is on');

	test('the mobile config reports it, with a short cache', async ({ page }) => {
		const response = await page.request.get('/api/mobile/config');
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ spotifyConnectEnabled: false });
		expect(response.headers()['cache-control']).toBe('public, max-age=60');
	});

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
		// With connect on, the Spotify e-mail is stored and checked for duplicates, so a second
		// account giving the same one is refused ("User already exists"). Off, it is neither
		// stored nor checked, so both signups go through: the field really is ignored.
		const spotifyEmail = `${unique('shared-spotify')}@clubfindr.test`;
		const first = await signUpWeb(page, `${unique('web-off-a')}@clubfindr.test`, spotifyEmail);
		expect(first.status()).toBe(200);
		expect(await first.json()).toEqual({ success: true, newAccount: true });

		const second = await signUpWeb(page, `${unique('web-off-b')}@clubfindr.test`, spotifyEmail);
		expect(second.status()).toBe(200);
		expect(await second.json()).toEqual({ success: true, newAccount: true });
	});

	test('the connect buttons are replaced by the "switched off" note', async ({ page }) => {
		expect((await signUpWeb(page, `${unique('web-off-ui')}@clubfindr.test`)).status()).toBe(200);
		for (const path of ['/users-home', '/']) {
			await page.goto(path);
			await acceptCookies(page);
			await expect(page.getByTestId('spotify-connect-off')).toBeVisible();
			await expect(page.getByTestId('spotify-connect')).toHaveCount(0);
		}
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
		// requiresSpotifySetup is only answered on the branch that calls spotify_service
		// (add_user), so its absence shows the call was skipped
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

	test('web venue registration drops the music service and never calls add_bar', async ({
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
		expect(admin!.text).toContain('Music Service: none');
		expect(admin!.text).not.toContain('Spotify Email');
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
		const response = await page.request.post('/api/mobile/bars/register', {
			data: venue(
				unique('Connect Off Mobile Bar'),
				`${unique('mobile-venue-off')}@clubfindr.test`,
				{
					musicService: 'spotify',
					musicServiceEmail: `${unique('mobile-venue-spotify')}@clubfindr.test`
				}
			)
		});
		expect(response.status()).toBe(200);
		expect(await response.json()).toMatchObject({ success: true });
		// Its mail goes out about 20 s later in the background (see the endpoint), longer than is
		// worth waiting for here; the web test above covers what the mail says
	});
});
