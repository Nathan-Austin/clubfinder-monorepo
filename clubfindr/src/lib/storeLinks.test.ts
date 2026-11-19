import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ANDROID_PACKAGE, APP_SCHEME, APP_STORE_URL, PLAY_STORE_URL } from './storeLinks';

// The /redirect page used to send people to com.clubfindr.app, com.tikli.app and an App Store
// id of XXXXXXXXXX (KNOWN_ISSUES 88). The app's own config is the one source.
const appJson = JSON.parse(
	readFileSync(fileURLToPath(new URL('../../../app_clubfindr/app.json', import.meta.url)), 'utf8')
) as { expo: { scheme: string; android: { package: string } } };

describe('store links', () => {
	it('name the app that app_clubfindr/app.json builds', () => {
		expect(ANDROID_PACKAGE).toBe(appJson.expo.android.package);
		expect(APP_SCHEME).toBe(appJson.expo.scheme);
		expect(PLAY_STORE_URL).toBe(
			`https://play.google.com/store/apps/details?id=${appJson.expo.android.package}`
		);
	});

	it('offer no App Store link until the app has a record there', () => {
		if (APP_STORE_URL !== null) {
			expect(APP_STORE_URL).toMatch(/^https:\/\/apps\.apple\.com\/.*\/id\d{6,}$/);
		}
	});
});
