import { test, expect, type Page, testPassword } from './fixtures';

// Genre fallback for picked artists (KNOWN_ISSUES 21, src/lib/taste/genreFallback.ts).
//
// "Cassette Mirage" is returned by tests/mock-spotify.ts with genres: [], and
// tests/mock-lastfm.ts has only noise tags for it ("seen live", "favourites"), so adding it
// has to fall all the way through to tests/mock-musicbrainz.ts, which votes it dub techno and
// ambient. "Glass Anvil" arrives from Spotify with a genre, so it must not touch either
// fallback provider.
//
// It is deliberately not "Unlabelled Static": that artist is the Last.fm import's own
// "imported without genres" fixture, and taste_artists is shared, so filling its genres here
// would break tests/taste.spec.ts.
//
// Each test signs up its own throwaway account, so it never shares a session with the seeded
// users that tests/taste.spec.ts relies on (see the note in tests/fixtures.ts).

const PASSWORD = testPassword();
const NO_GENRE_ARTIST = { sourceId: 'devCassetteMirage00001', name: 'Cassette Mirage' };
const SPOTIFY_GENRE_ARTIST = { sourceId: 'devGlassAnvil000000001', name: 'Glass Anvil' };

function uniqueEmail(testName: string) {
	const slug = testName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 30);
	return `fallback-${slug}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;
}

async function signUp(page: Page, email: string) {
	const response = await page.request.post('/login/users', {
		data: {
			provider: 'local',
			isNewUser: true,
			email,
			password: PASSWORD,
			fullName: 'Fallback Test'
		}
	});
	expect(response.status()).toBe(200);
}

test('an artist Spotify has no genres for gets them from the fallback chain', async ({
	page
}, testInfo) => {
	await signUp(page, uniqueEmail(testInfo.title));

	const response = await page.request.post('/api/taste/artists', {
		data: { sourceId: NO_GENRE_ARTIST.sourceId }
	});
	expect(response.status()).toBe(201);
	const body = await response.json();

	expect(body.artist.name).toBe(NO_GENRE_ARTIST.name);
	// MusicBrainz votes, not Last.fm's noise tags: the stoplist and the artist's own name are
	// dropped even though they carry more votes
	expect(body.artist.genres).toEqual(['dub techno', 'ambient']);
	expect(body.genres).toEqual(['ambient', 'dub techno']);

	// The genres are stored on the catalogue row, so listing never calls a provider again
	const profile = await (await page.request.get('/api/taste/artists')).json();
	expect(profile.artists[0].genres).toEqual(['dub techno', 'ambient']);
});

test("an artist Spotify does have genres for keeps Spotify's", async ({ page }, testInfo) => {
	await signUp(page, uniqueEmail(testInfo.title));

	const response = await page.request.post('/api/taste/artists', {
		data: { sourceId: SPOTIFY_GENRE_ARTIST.sourceId }
	});
	expect(response.status()).toBe(201);
	const body = await response.json();
	expect(body.artist.name).toBe(SPOTIFY_GENRE_ARTIST.name);
	// mock-musicbrainz would have said "industrial techno" too, but it is never asked
	expect(body.artist.genres).toEqual(['industrial techno']);
});

test('the fallback feeds the taste profile the picker shows', async ({ page }, testInfo) => {
	await signUp(page, uniqueEmail(testInfo.title));
	expect(
		(
			await page.request.post('/api/taste/artists', {
				data: { sourceId: NO_GENRE_ARTIST.sourceId }
			})
		).status()
	).toBe(201);

	await page.goto('/onboarding');
	const onboarding = page.getByTestId('onboarding');
	// the chip carries a remove button too, hence the regex
	await expect(onboarding.getByTestId('taste-favourite')).toHaveText([
		new RegExp(NO_GENRE_ARTIST.name)
	]);
	await expect(onboarding.getByTestId('taste-genre')).toHaveText(['ambient', 'dub techno']);
});
