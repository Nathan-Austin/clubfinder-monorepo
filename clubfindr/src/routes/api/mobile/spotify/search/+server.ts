// File: routes/api/mobile/spotify/search.js or .ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { Artist, Track } from '$lib/$types';

// Define the structure of incoming data
interface SearchRequestBody {
	q: string;
	userId: string;
	access_token: string;
}

// Define the response structure for the Spotify API
interface SpotifySearchResponse {
	artists?: {
		items: Array<{
			genres: string[];
			id: string;
			images: Array<{
				height: number;
				url: string;
				width: number;
			}>;
			name: string;
			external_urls: { spotify: string };
			popularity?: number;
		}>;
	};
	tracks?: {
		items: Array<{
			preview_url?: string;
			uri: string;
			id: string;
			name: string;
			album: {
				id: string;
				name: string;
				images: Array<{
					url: string;
					height: number;
					width: number;
				}>;
				external_urls: { spotify: string };
			};
			artists: Array<{
				external_urls: { spotify: string };
				id: string;
				name: string;
			}>;
			external_urls: { spotify: string };
		}>;
	};
}

// Helper functions to map Spotify data to our app's format
function mapToArtist(data: SpotifySearchResponse): Artist[] {
	// Handle empty items array or undefined artists
	if (!data.artists?.items || !Array.isArray(data.artists.items)) {
		return [];
	}

	return data.artists.items.map((item) => ({
		genres: item.genres || [],
		id: item.id,
		images:
			item.images?.map((image) => ({
				url: image.url,
				height: image.height,
				width: image.width
			})) || [],
		name: item.name,
		spotifyLink: {
			external_urls: item.external_urls?.spotify || '',
			spotify: item.external_urls?.spotify || ''
		}
	}));
}

function mapToTrack(data: SpotifySearchResponse): Track[] {
	// Handle empty items array or undefined tracks
	if (!data.tracks?.items || !Array.isArray(data.tracks.items)) {
		return [];
	}

	return data.tracks.items.map((item) => ({
		id: item.id,
		name: item.name,
		artists:
			item.artists?.map((artist) => ({
				id: artist.id || '',
				name: artist.name || '',
				spotifyLink: {
					external_urls: artist.external_urls?.spotify || '',
					spotify: artist.external_urls?.spotify || ''
				}
			})) || [],
		album: {
			id: item.album?.id || '',
			name: item.album?.name || '',
			images:
				item.album?.images?.map((image) => ({
					url: image.url || '',
					height: image.height || 0,
					width: image.width || 0
				})) || [],
			spotifyLink: item.album?.external_urls?.spotify || ''
		},
		preview_url: item.preview_url,
		uri: item.uri,
		spotifyLink: item.external_urls?.spotify || '',
		external_urls: item.external_urls?.spotify || ''
	}));
}

// GET endpoint handler for Spotify search
// This handles query parameters from the URL
export const GET: RequestHandler = async ({ url }) => {
	const startTime = Date.now();
	console.log('========================');
	console.log('MOBILE SPOTIFY SEARCH REQUEST (GET)');
	console.log('========================');

	try {
		// Get query parameters
		const searchQuery = url.searchParams.get('q');
		const userId = url.searchParams.get('userId');
		const accessToken = url.searchParams.get('access_token');

		if (!searchQuery || !userId || !accessToken) {
			return json({ success: false, message: 'Missing required parameters' }, { status: 400 });
		}

		return await performSearch(searchQuery, userId, accessToken, startTime);
	} catch (error) {
		console.error('Mobile Spotify search error (GET):', error);
		return json({ success: false, message: 'Failed to search Spotify' }, { status: 500 });
	}
};

// POST endpoint handler for Spotify search
// This handles data from the request body
export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	console.log('========================');
	console.log('MOBILE SPOTIFY SEARCH REQUEST (POST)');
	console.log('========================');

	try {
		// Get data from request body
		const body: SearchRequestBody = await request.json();
		const { q: searchQuery, userId, access_token: accessToken } = body;

		if (!searchQuery || !userId || !accessToken) {
			return json({ success: false, message: 'Missing required parameters' }, { status: 400 });
		}

		return await performSearch(searchQuery, userId, accessToken, startTime);
	} catch (error) {
		console.error('Mobile Spotify search error (POST):', error);
		return json({ success: false, message: 'Failed to search Spotify' }, { status: 500 });
	}
};

// Shared function to perform the search
async function performSearch(
	searchQuery: string,
	userId: string,
	accessToken: string,
	startTime: number
) {
	// Use access token to perform Spotify search
	const searchStart = Date.now();
	console.log(`Sending search request to Spotify for: "${searchQuery}"`);

	const response = await fetch(
		`https://api.spotify.com/v1/search?q=${encodeURIComponent(
			searchQuery
		)}&type=artist,track&limit=20`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		}
	);

	if (!response.ok) {
		console.error(`Spotify API error: ${response.status}`);
		return json(
			{ success: false, message: `Spotify API error: ${response.status}` },
			{ status: 500 }
		);
	}

	const data: SpotifySearchResponse = await response.json();
	console.log('Spotify search time:', Date.now() - searchStart, 'ms');

	// Safely map the response to our types with proper error handling
	const artists = mapToArtist(data);
	const tracks = mapToTrack(data);

	console.log('Total processing time:', Date.now() - startTime, 'ms');
	console.log(`Found ${artists.length} artists and ${tracks.length} tracks`);

	return json({
		success: true,
		data: {
			artists,
			tracks
		}
	});
}
