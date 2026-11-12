// A stand-in for the two Spotify hosts the app talks to from the server, for the e2e suite.
//
// Covers what the taste endpoints use (client-credentials token, artist search, artist by id,
// several artists by ids), the promoter track search (type=track), the guest artist-or-song
// search (type=artist,track): only what the one server-side app does, with its
// client-credentials token. (The user flow behind "Connect with Spotify" — authorization-code
// exchange, refresh, /v1/me and the listening endpoints — went with per-account connect.)
// Playwright's request interception cannot see server-side calls, so playwright.config.ts
// starts this server and points the app at it with SPOTIFY_ACCOUNTS_BASE / SPOTIFY_API_BASE.
// The catalogue is invented, like everything in dev/seed.sql; ids are Spotify-shaped (22
// base-62 chars).
//
// The error bodies follow Spotify's documented shape ({ error: { status, message } }); they
// were not captured from the live API (see docs/HANDOVER.md).
//
// Run by Playwright (`node tests/mock-spotify.ts`, Node 24 strips the types itself); by hand:
//   node tests/mock-spotify.ts            # listens on 127.0.0.1:4175
//   MOCK_SPOTIFY_PORT=5000 node tests/mock-spotify.ts

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const MOCK_SPOTIFY_PORT = Number(process.env.MOCK_SPOTIFY_PORT ?? 4175);
export const MOCK_SPOTIFY_TOKEN = 'mock-spotify-app-token';

interface MockArtist {
	id: string;
	name: string;
	genres: string[];
	images: { url: string; width: number; height: number }[];
}

/**
 * The three widths the live API serves (640, 320, 160; KNOWN_ISSUES 21) — notably not the 300
 * `parseSpotifyArtist` used to look for. Given to one artist so the suite covers a real image
 * set; the rest keep none, which is the other case the parser has to handle.
 */
const liveImageSizes = (slug: string) =>
	[640, 320, 160].map((width) => ({
		url: `https://i.scdn.co/image/${slug}-${width}`,
		width,
		height: width
	}));

/** Two overlap with dev/seed.sql's taste_artists (same ids), the rest are only known here. */
export const MOCK_ARTISTS: MockArtist[] = [
	{
		id: 'devJunoPaperplane00001',
		name: 'Juno Paperplane',
		genres: ['deep house', 'minimal'],
		images: liveImageSizes('juno-paperplane')
	},
	{
		id: 'devPerihelionChoir0001',
		name: 'Perihelion Choir',
		genres: ['ambient', 'modern classical'],
		images: []
	},
	{
		id: 'devPerihelionDrift0001',
		name: 'Perihelion Drift',
		genres: ['ambient techno', 'dub techno'],
		images: []
	},
	{
		id: 'devVelvetMeridian00001',
		name: 'Velvet Meridian',
		genres: ['italo disco', 'nu disco'],
		images: []
	},
	{ id: 'devGlassAnvil000000001', name: 'Glass Anvil', genres: ['industrial techno'], images: [] },
	// Eclectic on purpose: covers the seeded club nights the fan's profile does not reach
	// (Calor, Bassline Almanac, Night Shift Rock), so adding it visibly changes /clubs
	{
		id: 'devBasementOmnivore001',
		name: 'Basement Omnivore',
		genres: ['reggaeton', 'salsa', 'dancehall', 'dubstep', 'jungle', 'post-punk', 'shoegaze'],
		images: []
	},
	// Empty `genres` is common on the live API, not an edge case: it came back that way for
	// well-known acts in the 2026-11-10 run (KNOWN_ISSUES 21), which is why the fallback below
	// is a main path. These three artists are the suite's genre-less ones; the others keep
	// genres so the tests that need a known profile still have one.
	{ id: 'devNoGenresAtAll000001', name: 'Unlabelled Static', genres: [], images: [] },
	// Also without genres, but reserved for tests/genre-fallback.spec.ts: adding it must reach
	// the Last.fm and MusicBrainz fallback. Kept apart from Unlabelled Static, which the Last.fm
	// import test needs to stay genre-less in the shared taste_artists catalogue.
	{ id: 'devCassetteMirage00001', name: 'Cassette Mirage', genres: [], images: [] },
	// Likewise genre-less, and tests/mock-musicbrainz.ts answers 503 for it twice before
	// answering properly: adding it only gets genres if the client retries (KNOWN_ISSUES 21)
	{ id: 'devFaintTransmission01', name: 'Faint Transmission', genres: [], images: [] }
];

const artistRef = (a: MockArtist) => ({
	id: a.id,
	name: a.name,
	external_urls: { spotify: `https://open.spotify.com/artist/${a.id}` }
});

/** Tracks for type=track searches, in Spotify's track shape (the fields the app reads). */
const MOCK_TRACKS = [
	{ id: 'devTrackPaperDawn00001', name: 'Paper Planes at Dawn', artist: 'Juno Paperplane' },
	{ id: 'devTrackAnvilShuffle01', name: 'Anvil Shuffle', artist: 'Glass Anvil' }
].map((t) => ({
	id: t.id,
	name: t.name,
	uri: `spotify:track:${t.id}`,
	artists: [artistRef(MOCK_ARTISTS.find((a) => a.name === t.artist)!)],
	album: {
		id: `${t.id.slice(0, 18)}Albm`,
		name: `${t.name} (Single)`,
		images: [],
		external_urls: { spotify: `https://open.spotify.com/album/${t.id.slice(0, 18)}Albm` }
	},
	duration_ms: 240000,
	preview_url: null,
	external_urls: { spotify: `https://open.spotify.com/track/${t.id}` }
}));

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', (chunk) => (data += chunk));
		req.on('end', () => resolve(data));
	});
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

function spotifyError(res: ServerResponse, status: number, message: string) {
	sendJson(res, status, { error: { status, message } });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

	// accounts.spotify.com: the client-credentials token
	if (url.pathname === '/api/token') {
		if (req.method !== 'POST' || !req.headers.authorization?.startsWith('Basic ')) {
			// The live API sends error_description alongside error here too (KNOWN_ISSUES 21)
			return sendJson(res, 400, {
				error: 'invalid_client',
				error_description: 'Invalid client secret'
			});
		}
		const form = new URLSearchParams(await readBody(req));
		const grant = form.get('grant_type');
		if (grant === 'client_credentials') {
			return sendJson(res, 200, {
				access_token: MOCK_SPOTIFY_TOKEN,
				token_type: 'Bearer',
				expires_in: 3600
			});
		}
		return sendJson(res, 400, { error: 'unsupported_grant_type' });
	}

	// api.spotify.com: everything needs the token from above
	if (req.headers.authorization !== `Bearer ${MOCK_SPOTIFY_TOKEN}`) {
		return spotifyError(res, 401, 'Invalid access token');
	}

	if (url.pathname === '/v1/search') {
		const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
		const limit = Number(url.searchParams.get('limit') ?? 20);
		// type is a comma list: artist (the pickers), track (promoter track picker), or both
		// (the guest "Artist or song…" search on /spotify/search)
		const types = (url.searchParams.get('type') ?? 'artist').split(',');
		const body: Record<string, { items: unknown[]; total: number }> = {};
		if (types.includes('artist')) {
			const items = q ? MOCK_ARTISTS.filter((a) => a.name.toLowerCase().includes(q)) : [];
			body.artists = { items: items.slice(0, limit), total: items.length };
		}
		if (types.includes('track')) {
			// Spotify matches a track by its artists' names too
			const tracks = q
				? MOCK_TRACKS.filter((t) =>
						[t.name, ...t.artists.map((a) => a.name)].some((n) => n.toLowerCase().includes(q))
					)
				: [];
			body.tracks = { items: tracks.slice(0, limit), total: tracks.length };
		}
		return sendJson(res, 200, body);
	}

	// Several artists at once (/v1/artists?ids=a,b): Spotify answers null for an unknown id
	if (url.pathname === '/v1/artists') {
		const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
		if (ids.length === 0) return spotifyError(res, 400, 'invalid request');
		return sendJson(res, 200, {
			artists: ids.map((id) => MOCK_ARTISTS.find((a) => a.id === id) ?? null)
		});
	}

	const artistMatch = url.pathname.match(/^\/v1\/artists\/([0-9A-Za-z]{22})$/);
	if (artistMatch) {
		const artist = MOCK_ARTISTS.find((a) => a.id === artistMatch[1]);
		return artist ? sendJson(res, 200, artist) : spotifyError(res, 404, 'non existing id');
	}

	return spotifyError(res, 404, `mock-spotify: no route for ${req.method} ${url.pathname}`);
}

const server = createServer((req, res) => {
	handle(req, res).catch((error) => {
		console.error('mock-spotify:', error);
		spotifyError(res, 500, 'mock-spotify crashed');
	});
});
server.listen(MOCK_SPOTIFY_PORT, '127.0.0.1', () => {
	console.log(`mock-spotify listening on http://127.0.0.1:${MOCK_SPOTIFY_PORT}`);
});
