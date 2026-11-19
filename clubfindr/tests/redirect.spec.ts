import { test, expect } from './fixtures';
import { PLAY_STORE_URL } from '../src/lib/storeLinks';

// /redirect is where a phone's own camera lands from a venue's QR code (KNOWN_ISSUES 84). Its
// store links were placeholders that disagreed with each other, and its fallback fired even when
// the app had opened (KNOWN_ISSUES 88). The deep link itself cannot open anything in a test
// browser, so the page stays visible and the fallback is what is checked. The page's own
// navigation to clubfindr:// aborts in Chromium, which can detach a plain page.goto or a
// waitForURL under load: the tests wait for the page to commit and for the Play request itself.

const CODE = '/redirect?barId=00000000-0000-4000-8000-0000000000b1&qrId=7&type=checkin';

test('names the real app: one Play link, no placeholder App Store id', async ({ page }) => {
	await page.goto(CODE, { waitUntil: 'commit' });
	await expect(page.locator('h1')).toContainText('Opening Tilki');
	await expect(page.getByTestId('play-store-link')).toHaveAttribute('href', PLAY_STORE_URL);
	expect(PLAY_STORE_URL).toContain('id=com.clubfindr.mobile');
	await expect(page.getByTestId('app-store-link')).toHaveCount(0);
	expect(await page.content()).not.toContain('XXXXXXXXXX');
	expect(await page.content()).not.toMatch(/com\.clubfindr\.app|com\.tikli\.app/);
});

test('a desktop browser is not sent to a store it cannot use', async ({ page }) => {
	await page.goto(CODE, { waitUntil: 'commit' });
	await page.waitForTimeout(2600);
	expect(new URL(page.url()).pathname).toBe('/redirect');
});

test.describe('on an Android phone', () => {
	test.use({
		userAgent:
			'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
	});

	test('goes on to Google Play after two seconds when the app did not open', async ({ page }) => {
		// Test-level routes are matched before the fixture's offline block
		await page.route('https://play.google.com/**', (route) =>
			route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Play</title>' })
		);
		const playRequest = page.waitForRequest(
			(request) => request.url().startsWith('https://play.google.com/'),
			{ timeout: 10000 }
		);
		await page.goto(CODE, { waitUntil: 'commit' });
		expect((await playRequest).url()).toBe(PLAY_STORE_URL);
	});
});

test.describe('on an iPhone', () => {
	test.use({
		userAgent:
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	});

	test('stays put with a note until the app has an App Store record', async ({ page }) => {
		await page.goto(CODE, { waitUntil: 'commit' });
		await expect(page.getByTestId('ios-note')).toBeVisible();
		await page.waitForTimeout(2600);
		expect(new URL(page.url()).pathname).toBe('/redirect');
	});
});
