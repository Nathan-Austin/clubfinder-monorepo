// Where the app lives, for pages that send people to it (/redirect, which every listed QR code
// opens in a phone's own camera; KNOWN_ISSUES 88). One place, held to app_clubfindr/app.json by
// storeLinks.test.ts, so the badge and the script cannot name different apps again.

/** The Android application id (`android.package` in app_clubfindr/app.json). */
export const ANDROID_PACKAGE = 'com.clubfindr.mobile';

/** The deep-link scheme the app registers (`scheme` in app_clubfindr/app.json). */
export const APP_SCHEME = 'clubfindr';

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/**
 * The App Store page, once the app has a record there (ROADMAP section 5, "iPhone / App Store").
 * `null` until then: a dead store link is worse than none.
 */
export const APP_STORE_URL: string | null = null;
