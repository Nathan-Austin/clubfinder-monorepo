import { defineConfig, devices } from '@playwright/test';
import { MAIL_CAPTURE_FILE } from './tests/mail';

// End-to-end tests against the production build, served by the adapter-node server
// (`node build/index.js`, the same thing PM2 runs) on :4173 and backed by the seeded local
// database from dev/setup.sh. See dev/TESTING.md.
//
// The app's server-side Spotify calls (taste profile: token, artist search, artist by id) go
// to tests/mock-spotify.ts on :4175 instead of Spotify, through the SPOTIFY_*_BASE overrides,
// its Last.fm calls (taste profile import, genre fallback) to tests/mock-lastfm.ts on :4176,
// its MusicBrainz calls (genre fallback) to tests/mock-musicbrainz.ts on :4177, and its
// reCAPTCHA checks (registration) to tests/mock-recaptcha.ts on :4178.
//
// PW_SKIP_BUILD=1 reuses the existing build/ output instead of rebuilding first.
const port = 4173;
// Second instance of the same build, configured like production (ADDRESS_HEADER=cf-connecting-ip),
// for tests/rate-limit-cf.spec.ts only
const cfPort = 4174;
const mockSpotifyPort = 4175;
const mockLastfmPort = 4176;
const mockMusicbrainzPort = 4177;
const mockRecaptchaPort = 4178;
const serve = `node --env-file=.env build/index.js`;
// Process env set here wins over .env (node --env-file never overrides an existing variable)
const serverEnv = {
	// Never send real e-mail from the suite: the app writes it to the capture file instead
	MAIL_TRANSPORT: 'capture',
	MAIL_CAPTURE_FILE,
	// Never call the real Spotify, Last.fm or Google: the mock servers below answer instead
	SPOTIFY_API_BASE: `http://127.0.0.1:${mockSpotifyPort}`,
	SPOTIFY_ACCOUNTS_BASE: `http://127.0.0.1:${mockSpotifyPort}`,
	LASTFM_API_BASE: `http://127.0.0.1:${mockLastfmPort}`,
	LASTFM_API_KEY: 'mock-lastfm-key',
	MUSICBRAINZ_API_BASE: `http://127.0.0.1:${mockMusicbrainzPort}`,
	RECAPTCHA_VERIFY_BASE: `http://127.0.0.1:${mockRecaptchaPort}`
};

export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	timeout: 45_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testIgnore: /rate-limit-cf\.spec\.ts/
		},
		{
			name: 'cf-connecting-ip',
			testMatch: /rate-limit-cf\.spec\.ts/,
			use: { baseURL: `http://localhost:${cfPort}` }
		}
	],
	webServer: [
		{
			command: `node tests/mock-spotify.ts`,
			port: mockSpotifyPort,
			env: { MOCK_SPOTIFY_PORT: String(mockSpotifyPort) },
			reuseExistingServer: !process.env.CI,
			timeout: 30_000
		},
		{
			command: `node tests/mock-lastfm.ts`,
			port: mockLastfmPort,
			env: { MOCK_LASTFM_PORT: String(mockLastfmPort) },
			reuseExistingServer: !process.env.CI,
			timeout: 30_000
		},
		{
			command: `node tests/mock-musicbrainz.ts`,
			port: mockMusicbrainzPort,
			env: { MOCK_MUSICBRAINZ_PORT: String(mockMusicbrainzPort) },
			reuseExistingServer: !process.env.CI,
			timeout: 30_000
		},
		{
			command: `node tests/mock-recaptcha.ts`,
			port: mockRecaptchaPort,
			env: { MOCK_RECAPTCHA_PORT: String(mockRecaptchaPort) },
			reuseExistingServer: !process.env.CI,
			timeout: 30_000
		},
		{
			command: process.env.PW_SKIP_BUILD ? serve : `vite build && ${serve}`,
			port,
			reuseExistingServer: !process.env.CI,
			timeout: 300_000,
			env: {
				...serverEnv,
				PORT: String(port),
				// adapter-node needs the public origin for the CSRF check on form posts
				ORIGIN: `http://localhost:${port}`,
				// The test client stands in for the proxy: the last X-Forwarded-For entry (the one
				// tests/fixtures.ts sets per test) is the client address
				ADDRESS_HEADER: 'x-forwarded-for',
				XFF_DEPTH: '1'
			}
		},
		{
			// Started after the one above, so the build is in place
			command: serve,
			port: cfPort,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			env: {
				...serverEnv,
				PORT: String(cfPort),
				ORIGIN: `http://localhost:${cfPort}`,
				ADDRESS_HEADER: 'cf-connecting-ip'
			}
		}
	]
});
