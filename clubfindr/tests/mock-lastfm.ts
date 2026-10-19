// A stand-in for ws.audioscrobbler.com (the Last.fm API) for the e2e suite, started by
// playwright.config.ts and given to the app through LASTFM_API_BASE. It knows a handful of
// invented users and artists (some shared with tests/mock-spotify.ts and dev/seed.sql) and
// reproduces the API's error shapes: unknown user, rate limit, and a plain outage.
//
//   node tests/mock-lastfm.ts            # listens on 127.0.0.1:4176
//   MOCK_LASTFM_PORT=5001 node tests/mock-lastfm.ts

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const MOCK_LASTFM_PORT = Number(process.env.MOCK_LASTFM_PORT ?? 4176);

interface MockArtist {
	name: string;
	mbid: string;
	playcount: number;
	tags: [string, number][];
}

const ARTISTS: MockArtist[] = [
	{
		name: 'Juno Paperplane', // already one of the seeded fan's favourites: skipped on import
		mbid: '',
		playcount: 412,
		tags: [
			['deep house', 100],
			['minimal', 70],
			['seen live', 40]
		]
	},
	{
		name: 'Velvet Meridian',
		mbid: 'a1b2c3d4-0000-4000-8000-000000000001',
		playcount: 301,
		tags: [
			['seen live', 100],
			['Disco', 90],
			['nu disco', 60],
			['Velvet Meridian', 50],
			['italo disco', 40],
			['synthpop', 5]
		]
	},
	{
		name: 'Perihelion Drift',
		mbid: '',
		playcount: 255,
		tags: [
			['ambient techno', 100],
			['dub techno', 70],
			['electronic', 50],
			['seen live', 30]
		]
	},
	{
		name: 'Unlabelled Static', // only noise tags: imported without genres
		mbid: '',
		playcount: 120,
		tags: [
			['seen live', 100],
			['favourites', 50]
		]
	}
];

/** username -> top artists, or a canned failure */
const USERS: Record<string, MockArtist[] | { error: number; message: string; status: number }> = {
	fanatic: ARTISTS,
	solo_listener: [ARTISTS[2]],
	nobody_here: { error: 6, message: 'User not found', status: 404 },
	ratelimited: {
		error: 29,
		message: 'Rate limit exceeded - Your IP has made too many requests in a short period',
		status: 429
	}
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

function handle(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
	if (url.pathname !== '/2.0/') return sendJson(res, 404, { error: 3, message: 'Invalid Method' });
	if (!url.searchParams.get('api_key')) {
		return sendJson(res, 403, { error: 10, message: 'Invalid API key' });
	}
	if (url.searchParams.get('format') !== 'json') {
		return sendJson(res, 400, { error: 6, message: 'Invalid parameters: format=json expected' });
	}

	const method = url.searchParams.get('method');

	if (method === 'user.gettopartists') {
		const user = url.searchParams.get('user') ?? '';
		if (user === 'broken') {
			res.writeHead(500, { 'Content-Type': 'text/html' });
			return res.end('<html><body>Internal Server Error</body></html>');
		}
		const entry = USERS[user];
		if (!entry) return sendJson(res, 404, { error: 6, message: 'User not found' });
		if (!Array.isArray(entry)) {
			return sendJson(res, entry.status, { error: entry.error, message: entry.message });
		}
		const limit = Number(url.searchParams.get('limit') ?? 50);
		return sendJson(res, 200, {
			topartists: {
				artist: entry.slice(0, limit).map((a, i) => ({
					name: a.name,
					mbid: a.mbid,
					url: `https://www.last.fm/music/${encodeURIComponent(a.name).replace(/%20/g, '+')}`,
					playcount: String(a.playcount),
					'@attr': { rank: String(i + 1) },
					image: [{ '#text': '', size: 'large' }]
				})),
				'@attr': { user, page: '1', perPage: String(limit), total: String(entry.length) }
			}
		});
	}

	if (method === 'artist.gettoptags') {
		const name = (url.searchParams.get('artist') ?? '').toLowerCase();
		const artist = ARTISTS.find((a) => a.name.toLowerCase() === name);
		if (!artist)
			return sendJson(res, 404, {
				error: 6,
				message: 'The artist you supplied could not be found'
			});
		return sendJson(res, 200, {
			toptags: {
				tag: artist.tags.map(([tag, count]) => ({
					name: tag,
					count,
					url: `https://www.last.fm/tag/${encodeURIComponent(tag)}`
				})),
				'@attr': { artist: artist.name }
			}
		});
	}

	return sendJson(res, 400, {
		error: 3,
		message: `Invalid Method - No method with that name: ${method}`
	});
}

const server = createServer(handle);
server.listen(MOCK_LASTFM_PORT, '127.0.0.1', () => {
	console.log(`mock-lastfm listening on http://127.0.0.1:${MOCK_LASTFM_PORT}`);
});
