import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the production build, served by `vite preview` on :4173 and
// backed by the seeded local database from dev/setup.sh. See dev/TESTING.md.
//
// PW_SKIP_BUILD=1 reuses the existing build/ output instead of rebuilding first.
const port = 4173;

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
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: process.env.PW_SKIP_BUILD
			? `vite preview --port ${port}`
			: `vite build && vite preview --port ${port}`,
		port,
		reuseExistingServer: !process.env.CI,
		timeout: 300_000
	}
});
