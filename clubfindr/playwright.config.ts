import { defineConfig, devices } from '@playwright/test';
import { MAIL_CAPTURE_FILE } from './tests/mail';

// End-to-end tests against the production build, served by the adapter-node server
// (`node build/index.js`, the same thing PM2 runs) on :4173 and backed by the seeded local
// database from dev/setup.sh. See dev/TESTING.md.
//
// PW_SKIP_BUILD=1 reuses the existing build/ output instead of rebuilding first.
const port = 4173;
// Second instance of the same build, configured like production (ADDRESS_HEADER=cf-connecting-ip),
// for tests/rate-limit-cf.spec.ts only
const cfPort = 4174;
const serve = `node --env-file=.env build/index.js`;
const serverEnv = {
	// Never send real e-mail from the suite: the app writes it to the capture file instead
	MAIL_TRANSPORT: 'capture',
	MAIL_CAPTURE_FILE
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
			// Started after the first one, so the build above is in place
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
