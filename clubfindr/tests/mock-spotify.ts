// A stand-in for the two Spotify hosts the app talks to from the server, for the e2e suite.
//
// Covers what the taste endpoints use (client-credentials token, artist search, artist by id)
// and the user flow behind "Connect with Spotify": the authorization-code exchange, token
// refresh, /v1/me and the three listening endpoints of /spotify. Playwright's request
// interception cannot see server-side calls, so playwright.config.ts starts this server and
// points the app at it with SPOTIFY_ACCOUNTS_BASE / SPOTIFY_API_BASE. The catalogue is
// invented, like everything in dev/seed.sql; ids are Spotify-shaped (22 base-62 chars).
//
// Users are selected by the authorization code (the "code" Spotify would redirect back with):
//   mock-code-ok            a registered account, everything works
//   mock-code-unregistered  an account the development-mode app may not access: every API
//                           call answers 403 "User not registered in the Developer Dashboard"
//   mock-code-partial       registered, but recently-played answers 503
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

/** Two overlap with dev/seed.sql's taste_artists (same ids), the rest are only known here. */
export const MOCK_ARTISTS: MockArtist[] = [
	{
		id: 'devJunoPaperplane00001',
		name: 'Juno Paperplane',
		genres: ['deep house', 'minimal'],
		images: []
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
	{ id: 'devNoGenresAtAll000001', name: 'Unlabelled Static', genres: [], images: [] }
];

type MockUser = 'ok' | 'unregistered' | 'partial';
const USER_CODES: Record<string, MockUser> = {
	'mock-code-ok': 'ok',
	'mock-code-unregistered': 'unregistered',
	'mock-code-partial': 'partial'
};
const userToken = (user: MockUser) => `mock-user-token-${user}`;
const userRefresh = (user: MockUser) => `mock-refresh-token-${user}`;
function userFromBearer(header: string | undefined): MockUser | null {
	const match = header?.match(/^Bearer mock-user-token-(ok|unregistered|partial)$/);
	return match ? (match[1] as MockUser) : null;
}

const artistRef = (a: MockArtist) => ({
	id: a.id,
	name: a.name,
	external_urls: { spotify: `https://open.spotify.com/artist/${a.id}` }
});

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
	const base = `http://${req.headers.host ?? `127.0.0.1:${MOCK_SPOTIFY_PORT}`}`;

	// accounts.spotify.com: tokens (client credentials, authorization code, refresh)
	if (url.pathname === '/api/token') {
		if (req.method !== 'POST' || !req.headers.authorization?.startsWith('Basic ')) {
			return sendJson(res, 400, { error: 'invalid_client' });
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
		if (grant === 'authorization_code') {
			const user = USER_CODES[form.get('code') ?? ''];
			if (!user)
				return sendJson(res, 400, {
					error: 'invalid_grant',
					error_description: 'Invalid authorization code'
				});
			return sendJson(res, 200, {
				access_token: userToken(user),
				refresh_token: userRefresh(user),
				token_type: 'Bearer',
				scope: 'user-read-recently-played user-top-read playlist-read-private user-read-email',
				expires_in: 3600
			});
		}
		if (grant === 'refresh_token') {
			const match = (form.get('refresh_token') ?? '').match(
				/^mock-refresh-token-(ok|unregistered|partial)$/
			);
			if (!match)
				return sendJson(res, 400, {
					error: 'invalid_grant',
					error_description: 'Invalid refresh token'
				});
			return sendJson(res, 200, {
				access_token: userToken(match[1] as MockUser),
				token_type: 'Bearer',
				expires_in: 3600
			});
		}
		return sendJson(res, 400, { error: 'unsupported_grant_type' });
	}

	// api.spotify.com: everything needs a token from above
	const user = userFromBearer(req.headers.authorization);
	if (req.headers.authorization !== `Bearer ${MOCK_SPOTIFY_TOKEN}` && !user) {
		return spotifyError(res, 401, 'Invalid access token');
	}

	// User endpoints (/v1/me...): the development-mode allow list applies
	if (
		url.pathname === '/v1/me' ||
		url.pathname.startsWith('/v1/me/') ||
		url.pathname.startsWith('/v1/playlists/')
	) {
		if (!user) return spotifyError(res, 401, 'Valid user authentication required');
		if (user === 'unregistered') {
			return spotifyError(res, 403, 'User not registered in the Developer Dashboard');
		}
		if (url.pathname === '/v1/me') {
			return sendJson(res, 200, {
				id: `mockuser-${user}`,
				display_name: `Mock ${user}`,
				email: `mockuser-${user}@clubfindr.test`,
				images: [],
				external_urls: { spotify: `https://open.spotify.com/user/mockuser-${user}` }
			});
		}
		if (url.pathname === '/v1/me/player/recently-played') {
			if (user === 'partial') return spotifyError(res, 503, 'Service unavailable');
			return sendJson(res, 200, {
				items: [
					{
						track: {
							id: 'devTrackGlassAnvil0001',
							name: 'Anvil Shuffle',
							artists: [artistRef(MOCK_ARTISTS[4])],
							album: { images: [], external_urls: { spotify: 'https://open.spotify.com/album/x' } },
							external_urls: { spotify: 'https://open.spotify.com/track/x' }
						},
						played_at: '2026-10-17T20:00:00Z'
					}
				]
			});
		}
		if (url.pathname === '/v1/me/playlists') {
			return sendJson(res, 200, {
				items: [
					{
						id: 'devPlaylistLateNight01',
						name: 'Late Night Mock',
						images: [],
						description: 'invented',
						tracks: { href: `${base}/v1/playlists/devPlaylistLateNight01/tracks`, total: 1 },
						external_urls: { spotify: 'https://open.spotify.com/playlist/x' }
					}
				]
			});
		}
		if (url.pathname === '/v1/playlists/devPlaylistLateNight01/tracks') {
			return sendJson(res, 200, {
				items: [
					{
						track: {
							id: 'devTrackVelvet00000001',
							name: 'Meridian',
							artists: [artistRef(MOCK_ARTISTS[3])]
						}
					}
				]
			});
		}
		if (url.pathname === '/v1/me/top/artists') {
			return sendJson(res, 200, {
				items: [MOCK_ARTISTS[4], MOCK_ARTISTS[3], MOCK_ARTISTS[2]].map((a) => ({
					...a,
					external_urls: { spotify: `https://open.spotify.com/artist/${a.id}` }
				}))
			});
		}
		return spotifyError(res, 404, `mock-spotify: no route for ${req.method} ${url.pathname}`);
	}

	if (url.pathname === '/v1/search') {
		const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
		const limit = Number(url.searchParams.get('limit') ?? 20);
		const items = q ? MOCK_ARTISTS.filter((a) => a.name.toLowerCase().includes(q)) : [];
		return sendJson(res, 200, { artists: { items: items.slice(0, limit), total: items.length } });
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
