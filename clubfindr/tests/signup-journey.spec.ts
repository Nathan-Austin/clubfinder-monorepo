import { test, expect, acceptCookies, SPOTIFY_CONNECT_ENABLED } from './fixtures';

// The whole point of ROADMAP section 1, in one go: someone signs up, names a few artists and
// gets personalised results, without connecting any streaming account at any step.
//
// The other specs each cover one piece (onboarding.spec.ts stops at /users-home;
// taste.spec.ts starts from the seeded fan's existing favourites). This one joins them up for
// a brand-new account, so a regression anywhere along the path shows up here.
//
// Runs in both modes: with Spotify connect on it also checks that nothing on the way asked for
// Spotify, and with it off that the connect buttons are gone entirely.

const PASSWORD = 'Journey#2026';

/**
 * Three artists from the mock Spotify catalogue (tests/mock-spotify.ts), whose genres are the
 * same set the seeded fan has, so they reach the nights tests/taste.spec.ts pins.
 */
const PICKS = [
	{ query: 'juno', name: 'Juno Paperplane' }, // deep house, minimal
	{ query: 'kasimir', name: 'Kasimir Low' }, // minimal techno, dub techno
	{ query: 'tamsin', name: 'Tamsin Okra' } // afro house, amapiano
];
const EXPECTED_GENRES = [
	'afro house',
	'amapiano',
	'deep house',
	'dub techno',
	'minimal',
	'minimal techno'
];
/** dev/seed.sql pins four Berlin nights on this date; these two are what those genres reach. */
const PINNED_DATE = '2031-06-21';
const EXPECTED_NIGHTS = ['Velour at Hollow Moon Club', 'Glasshouse at Parallax Cellar'];

test('sign up, pick artists, get matching clubs, with no streaming account', async ({
	page,
	pageErrors
}) => {
	const email = `journey-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;

	// 1. Sign up. Nothing here is required beyond a name, an e-mail and a password.
	await page.goto('/login/users');
	await acceptCookies(page);
	const form = page.locator('form.login-form');
	await form.getByLabel("I'm a new user").check();
	await form.locator('#email').fill(email);
	await form.locator('#password').fill(PASSWORD);
	await form.locator('#fullName').fill('Journey Tester');
	if (SPOTIFY_CONNECT_ENABLED) {
		// Offered, but optional: left empty, so spotify_service is never called for this account
		await expect(form.locator('#spotifyEmail')).toBeVisible();
	} else {
		await expect(form.locator('#spotifyEmail')).toHaveCount(0);
	}
	await form.locator('button[type="submit"]').click();

	// 2. The artist picker, not the home page
	await page.waitForURL('**/onboarding');
	const onboarding = page.getByTestId('onboarding');
	await expect(onboarding.getByTestId('onboarding-progress')).toHaveText('0 of 3 picked');
	await expect(onboarding.getByTestId('onboarding-continue')).toBeDisabled();

	// 3. Name three artists. Search goes through the server-side Spotify app, which needs no
	// account of the user's (tests/mock-spotify.ts stands in for it here).
	for (const artist of PICKS) {
		await onboarding.getByTestId('taste-search').fill(artist.query);
		await onboarding.getByRole('button', { name: `Add ${artist.name}` }).click();
		await expect(
			onboarding.getByTestId('taste-favourite').filter({ hasText: artist.name })
		).toHaveCount(1);
	}
	// Their genres are the profile
	await expect(onboarding.getByTestId('taste-genre')).toHaveText(EXPECTED_GENRES);
	await expect(onboarding.getByTestId('onboarding-progress')).toHaveText(
		'3 picked. You are good to go.'
	);

	await onboarding.getByTestId('onboarding-continue').click();
	await page.waitForURL('**/users-home');

	// 4. The profile is what the matching reads: search with it and the results are the nights
	// those genres reach, the same two tests/taste.spec.ts expects for the same genre set.
	await page.goto('/');
	await acceptCookies(page);
	await page.locator('#city-select').selectOption('Berlin');
	await page.getByTestId('taste-find-clubs').click();
	await page.waitForURL('**/clubs');
	await page.goto(`/clubs?date=${PINNED_DATE}`);
	await expect(page.locator('h1')).toContainText('ClubFinder Berlin');
	await expect(page.locator('a.event-link')).toHaveText(EXPECTED_NIGHTS);

	// 5. Nothing along the way needed Spotify. With connect on the offer is still there (it is
	// an offer, not a step); with it off there is nothing to connect at all.
	if (SPOTIFY_CONNECT_ENABLED) {
		await expect(page.getByTestId('spotify-connect-off')).toHaveCount(0);
	} else {
		await page.goto('/users-home');
		await acceptCookies(page);
		await expect(page.getByTestId('spotify-connect')).toHaveCount(0);
		await expect(page.getByTestId('spotify-connect-off')).toBeVisible();
	}

	expect(pageErrors).toEqual([]);
});
