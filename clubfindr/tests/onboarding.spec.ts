import { test, expect, acceptCookies, type Page, testPassword } from './fixtures';

// Artist picker onboarding (ROADMAP section 1, src/routes/onboarding). Every test signs up its
// own throwaway account, so it never logs in as a seeded user that another spec relies on
// (see the session note in tests/fixtures.ts) and the tests can run in parallel. Artist search
// and lookups go to tests/mock-spotify.ts, whose artists are invented.

const PASSWORD = testPassword();

/** Mock Spotify artists (tests/mock-spotify.ts), picked through the onboarding search. */
const PICKS = [
	{ query: 'perihelion', name: 'Perihelion Choir', sourceId: 'devPerihelionChoir0001' },
	{ query: 'perihelion', name: 'Perihelion Drift', sourceId: 'devPerihelionDrift0001' },
	{ query: 'velvet', name: 'Velvet Meridian', sourceId: 'devVelvetMeridian00001' },
	{ query: 'glass', name: 'Glass Anvil', sourceId: 'devGlassAnvil000000001' },
	{ query: 'basement', name: 'Basement Omnivore', sourceId: 'devBasementOmnivore001' }
];
const EXTRA = { name: 'Juno Paperplane', sourceId: 'devJunoPaperplane00001' };

function uniqueEmail(testName: string) {
	const slug = testName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 30);
	return `onboarding-${slug}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;
}

/** Signs up through the API; the browser context keeps the session cookie. */
async function signUpViaApi(page: Page, email: string) {
	const response = await page.request.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			email,
			password: PASSWORD,
			fullName: 'Onboarding Test'
		}
	});
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ success: true, newAccount: true });
}

async function addViaApi(page: Page, sourceId: string) {
	const response = await page.request.post('/api/taste/artists', { data: { sourceId } });
	expect(response.status()).toBe(201);
}

async function pick(page: Page, query: string, name: string) {
	const onboarding = page.getByTestId('onboarding');
	await onboarding.getByTestId('taste-search').fill(query);
	await onboarding.getByRole('button', { name: `Add ${name}` }).click();
	await expect(onboarding.getByTestId('taste-favourite').filter({ hasText: name })).toHaveCount(1);
}

test('needs a login', async ({ page }) => {
	await page.goto('/onboarding');
	await expect(page).toHaveURL(/\/login\/users$/);
});

test('signing up through the form lands on onboarding; 3 picks unlock Continue, 5 is the cap', async ({
	page
}, testInfo) => {
	const email = uniqueEmail(testInfo.title);
	await page.goto('/login/users');
	await acceptCookies(page);
	const form = page.locator('form').first();
	await form.getByLabel("I'm a new user").check();
	await form.locator('#email').fill(email);
	await form.locator('#password').fill(PASSWORD);
	await form.locator('#fullName').fill('Onboarding Test');
	await form.locator('button[type="submit"]').click();
	await page.waitForURL('**/onboarding');

	const onboarding = page.getByTestId('onboarding');
	const continueButton = onboarding.getByTestId('onboarding-continue');
	await expect(onboarding.getByRole('heading', { level: 1 })).toHaveText(
		'Pick 3 to 5 artists you love'
	);
	await expect(onboarding.getByTestId('taste-empty')).toBeVisible();
	await expect(onboarding.getByTestId('onboarding-progress')).toHaveText('0 of 3 picked');
	await expect(continueButton).toBeDisabled();

	for (const [index, artist] of PICKS.slice(0, 2).entries()) {
		await pick(page, artist.query, artist.name);
		await expect(onboarding.getByTestId('onboarding-progress')).toHaveText(
			`${index + 1} of 3 picked`
		);
		await expect(continueButton).toBeDisabled();
	}

	// Third pick: the profile is usable, the genres of the picks show up
	await pick(page, PICKS[2].query, PICKS[2].name);
	await expect(onboarding.getByTestId('onboarding-progress')).toHaveText(
		'3 picked. You are good to go.'
	);
	await expect(continueButton).toBeEnabled();
	await expect(onboarding.getByTestId('taste-genre')).toContainText(['ambient', 'italo disco']);
	await expect(onboarding.getByTestId('taste-at-max')).toHaveCount(0);

	// Up to the cap of 5: further Add buttons are disabled and the note points to more
	await pick(page, PICKS[3].query, PICKS[3].name);
	await pick(page, PICKS[4].query, PICKS[4].name);
	const note = onboarding.getByTestId('taste-at-max');
	await expect(note).toContainText('add as many more as you like');
	await expect(note.getByRole('link', { name: 'your taste profile' })).toHaveAttribute(
		'href',
		'/#taste-profile'
	);
	await expect(note.getByRole('link', { name: 'your account page' })).toHaveAttribute(
		'href',
		'/users-home'
	);
	await onboarding.getByTestId('taste-search').fill('juno');
	await expect(onboarding.getByRole('button', { name: `Add ${EXTRA.name}` })).toBeDisabled();
	await expect(continueButton).toBeEnabled();

	// The picks are the user's taste profile
	const profile = await (await page.request.get('/api/taste/artists')).json();
	expect(profile.artists.map((a: { name: string }) => a.name)).toEqual(PICKS.map((p) => p.name));

	await continueButton.click();
	await page.waitForURL('**/users-home');
});

test('skip goes home without picking anything', async ({ page }, testInfo) => {
	await signUpViaApi(page, uniqueEmail(testInfo.title));
	await page.goto('/onboarding');
	await acceptCookies(page);
	await page.getByTestId('onboarding-skip').click();
	await page.waitForURL('**/users-home');
	// Still not onboarded, so the step is offered again
	await page.goto('/onboarding');
	await expect(page).toHaveURL(/\/onboarding$/);
});

test('a user with 3 artists is sent on, unless they ask to edit', async ({ page }, testInfo) => {
	await signUpViaApi(page, uniqueEmail(testInfo.title));
	for (const artist of PICKS.slice(0, 3)) await addViaApi(page, artist.sourceId);

	await page.goto('/onboarding');
	await expect(page).toHaveURL(/\/users-home$/);

	await page.goto('/onboarding?edit');
	await acceptCookies(page);
	const onboarding = page.getByTestId('onboarding');
	await expect(onboarding.getByTestId('taste-favourite')).toHaveCount(3);
	await expect(onboarding.getByTestId('onboarding-continue')).toBeEnabled();
});

test('the cap is advisory: artists added elsewhere beyond 5 stay and the step stays complete', async ({
	page
}, testInfo) => {
	await signUpViaApi(page, uniqueEmail(testInfo.title));
	// The server only enforces MAX_FAVOURITE_ARTISTS, so a sixth artist is accepted
	for (const artist of [...PICKS, EXTRA]) await addViaApi(page, artist.sourceId);

	await page.goto('/onboarding?edit');
	await acceptCookies(page);
	const onboarding = page.getByTestId('onboarding');
	await expect(onboarding.getByTestId('taste-favourite')).toHaveCount(6);
	await expect(onboarding.getByTestId('taste-at-max')).toBeVisible();
	await expect(onboarding.getByTestId('onboarding-continue')).toBeEnabled();
});

// ROADMAP section 1 follow-up: only new accounts were sent to /onboarding, so an existing
// account could sit below ONBOARDING_MIN_ARTISTS with nothing pointing it at the step.
test('users-home nudges a thin taste profile towards /onboarding, and stops once it is filled', async ({
	page
}, testInfo) => {
	await signUpViaApi(page, uniqueEmail(testInfo.title));

	// No artists at all: the nudge offers the quick start
	await page.goto('/users-home');
	await acceptCookies(page);
	const nudge = page.getByTestId('onboarding-nudge');
	await expect(nudge).toBeVisible();
	await expect(nudge).toContainText('no streaming account needed');

	// One artist: the nudge counts what is there and asks for the rest
	await addViaApi(page, PICKS[0].sourceId);
	await page.goto('/users-home');
	await expect(nudge).toContainText('1 favourite artist');

	// Its link lands on the onboarding picker with the artist already shown
	await nudge.getByTestId('onboarding-nudge-link').click();
	await expect(page).toHaveURL(/\/onboarding$/);
	await expect(page.getByTestId('onboarding').getByTestId('taste-favourite')).toHaveCount(1);

	// At 3 artists the profile is usable and the nudge is gone
	for (const artist of PICKS.slice(1, 3)) await addViaApi(page, artist.sourceId);
	await page.goto('/users-home');
	await expect(page.getByTestId('onboarding-nudge')).toHaveCount(0);
});
