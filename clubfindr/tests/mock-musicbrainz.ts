// A stand-in for musicbrainz.org for the e2e suite, started by playwright.config.ts and given
// to the app through MUSICBRAINZ_API_BASE. It is the last step of the genre fallback
// (src/lib/taste/genreFallback.ts), reached only for artists Spotify and Last.fm have no
// genres for.
//
// The artists are invented, like everything in dev/seed.sql. Tag counts are raw vote counts
// (1, 2, 3 …) as MusicBrainz reports them, not Last.fm's 0-100 relevance scale, which is the
// difference the fallback has to get right. The response shape follows the documented search
// API (https://musicbrainz.org/doc/MusicBrainz_API); it was not captured from the live
// service (see docs/HANDOVER.md).
//
//   node tests/mock-musicbrainz.ts            # listens on 127.0.0.1:4177
//   MOCK_MUSICBRAINZ_PORT=5002 node tests/mock-musicbrainz.ts

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const MOCK_MUSICBRAINZ_PORT = Number(process.env.MOCK_MUSICBRAINZ_PORT ?? 4177);

interface MockArtist {
	id: string;
	name: string;
	score: number;
	tags: [string, number][];
}

const ARTISTS: MockArtist[] = [
	{
		// tests/mock-spotify.ts returns this one with genres: [], and tests/mock-lastfm.ts has
		// only noise tags for it, so the fallback reaches MusicBrainz
		id: 'b0000000-0000-4000-8000-000000000001',
		name: 'Cassette Mirage',
		score: 100,
		tags: [
			['dub techno', 3],
			['ambient', 2],
			['seen live', 5], // stoplisted, however many votes it has
			['Cassette Mirage', 2] // the artist's own name is dropped
		]
	},
	{
		// A near-miss that scores higher than the exact match, to pin the exact-name preference
		id: 'b0000000-0000-4000-8000-000000000002',
		name: 'Cassette Mirage Trio',
		score: 100,
		tags: [['jazz', 9]]
	},
	{
		id: 'b0000000-0000-4000-8000-000000000003',
		name: 'Glass Anvil',
		score: 100,
		tags: [['industrial techno', 4]]
	}
];

function sendJson(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

/** Pulls the name out of a Lucene query like artist:"Some Name". */
function queriedName(query: string): string {
	const match = query.match(/artist:"(.*)"/s);
	return (match ? match[1] : query).replace(/\\"/g, '"').trim().toLowerCase();
}

function handle(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
	if (url.pathname !== '/ws/2/artist') {
		return sendJson(res, 404, { error: 'Not Found' });
	}
	// MusicBrainz rejects callers that do not identify themselves
	const userAgent = req.headers['user-agent'] ?? '';
	if (!userAgent || /^(curl|python|node)/i.test(userAgent)) {
		return sendJson(res, 403, { error: 'Please provide a descriptive User-Agent' });
	}
	if (url.searchParams.get('fmt') !== 'json') {
		return sendJson(res, 400, { error: 'Only fmt=json is mocked' });
	}

	const name = queriedName(url.searchParams.get('query') ?? '');
	if (name === 'rate limited act') {
		return sendJson(res, 503, { error: 'Your requests are exceeding the allowable rate limit.' });
	}

	const matches = ARTISTS.filter((artist) => artist.name.toLowerCase().includes(name) && !!name)
		// highest score first, as the real search does
		.sort((a, b) => b.score - a.score);

	return sendJson(res, 200, {
		created: '2026-01-01T00:00:00.000Z',
		count: matches.length,
		offset: 0,
		artists: matches.map((artist) => ({
			id: artist.id,
			type: 'Group',
			score: artist.score,
			name: artist.name,
			'sort-name': artist.name,
			tags: artist.tags.map(([tag, count]) => ({ count, name: tag }))
		}))
	});
}

const server = createServer(handle);
server.listen(MOCK_MUSICBRAINZ_PORT, '127.0.0.1', () => {
	console.log(`mock-musicbrainz listening on http://127.0.0.1:${MOCK_MUSICBRAINZ_PORT}`);
});
