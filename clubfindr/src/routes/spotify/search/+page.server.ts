/* eslint-disable @typescript-eslint/no-explicit-any */
import { VITE_SPOTIFY_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_SPOTIFY_CLIENT_ID } from '$env/static/public';
import { Buffer } from 'buffer';
import type { Artist_search, Track } from '$lib/$types';
import { cookieManager } from '$lib/cookieManager';

const client_id = PUBLIC_SPOTIFY_CLIENT_ID;
const client_secret = VITE_SPOTIFY_CLIENT_SECRET;

const token_endpoint = `https://accounts.spotify.com/api/token`;
//let accessToken: string;
//let tokenExpiry: number | null = null; // Token expiry in milliseconds

const searchEndpoint = (query: string) =>
	`https://api.spotify.com/v1/search?q=${query}&type=artist,track`;

export const load = async ({ cookies }) => {
	let searchQuery = cookies.get('search') ?? '';
	console.log('Search Query:', searchQuery);

	if (!searchQuery) {
		return {
			props: {
				artists: [],
				tracks: [],
				message: 'Your search session has expired. Please enter a new search query.'
			}
		};
	}

	searchQuery = searchQuery.trim();

	if (!searchQuery) {
		return {
			props: {
				artists: [],
				tracks: [],
				message: 'Please enter a valid search query.'
			}
		};
	}

	// Check if the access token is still valid
	// Retrieve the encrypted tokens from cookies
	const encryptedAccessToken = cookieManager.get(cookies, 'spotifyAccessToken');
	const encryptedTokenExpiry = cookieManager.get(cookies, 'spotifyTokenExpiry');

	console.log('Encrypted Access Token:', encryptedAccessToken);
	console.log('Encrypted Token Expiry:', encryptedTokenExpiry);

	// Decrypt the tokens
	let accessToken = encryptedAccessToken; // ? decryptToken(encryptedAccessToken) : null;
	let tokenExpiry = encryptedTokenExpiry ? parseInt(encryptedTokenExpiry, 10) : 0;

	console.log('Decrypted Access Token:', accessToken);
	console.log('Decrypted Token Expiry (timestamp):', tokenExpiry);

	const now = Date.now();
	console.log('Current Time (timestamp):', now);

	if (!accessToken || !tokenExpiry || now >= tokenExpiry) {
		console.log('Token expired or missing, fetching new token');

		// Base64 encode the client ID and secret
		const encodedString = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

		// Fetch a new access token using client credentials
		const response = await fetch(token_endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${encodedString}`
			},
			body: new URLSearchParams({
				grant_type: 'client_credentials'
			})
		});

		console.log('Token request response status:', response.status);

		const data = await response.json();

		if (!data.access_token) {
			console.error('Failed to retrieve access token from Spotify');
			throw new Error('Failed to retrieve access token from Spotify');
		}

		// Set the new access token and its expiry time
		accessToken = data.access_token;
		// Token expires in `expires_in` seconds (convert to milliseconds and add to current time)
		tokenExpiry = now + data.expires_in * 1000;

		cookieManager.set(cookies, 'spotifyAccessToken', accessToken, {
			path: '/', // Make it available site-wide
			maxAge: data.expires_in // Ensure the cookie lasts as long as the token is valid
		});
	}
	console.log('Using Access Token:', accessToken);

	// Fetch artists and tracks using the valid access token
	const spotifyResponse = await fetch(searchEndpoint(searchQuery), {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	console.log('Spotify Response Status:', spotifyResponse.status);

	if (!spotifyResponse.ok) {
		console.error('Spotify API request failed:', spotifyResponse.statusText);
		throw new Error(`Spotify API request failed: ${spotifyResponse.statusText}`);
	}

	const spotifyData = await spotifyResponse.json();
	//console.log('Spotify Data:', spotifyData);

	// Map artists and tracks separately
	const artists = mapToArtist(spotifyData);
	const tracks = mapToTrack(spotifyData);

	return {
		props: {
			artists,
			tracks
		}
	};
};

type Data = {
	artists: {
		items: {
			genres: string[];
			id: string;
			images: {
				height: number;
				url: string;
				width: number;
			}[];
			name: string;
			external_urls: { spotify: string }; // Spotify link for the artist
		}[];
	};
	tracks: {
		items: {
			preview_url: any;
			uri: any;
			id: string;
			name: string;
			album: {
				id: any;
				name: string;
				images: {
					url: string;
					height: number;
					width: number;
				}[];
				external_urls: { spotify: string }; // Spotify link for the album
			};
			artists: {
				external_urls: any;
				id: string;
				name: string;
			}[];
			external_urls: { spotify: string }; // Spotify link for the track
		}[];
	};
};

function mapToArtist(data: Data): Artist_search[] {
	return data.artists.items.map((item) => {
		return {
			genres: item.genres,
			id: item.id,
			images: item.images.map((image) => {
				return {
					url: image.url,
					height: image.height,
					width: image.width
				};
			}),
			name: item.name,
			spotifyLink: `https://open.spotify.com/artist/${item.id}` // Adding Spotify link
		};
	});
}

function mapToTrack(data: Data): Track[] {
	return data.tracks.items.map((item) => ({
		id: item.id,
		name: item.name,
		artists: item.artists.map((artist) => ({
			id: artist.id,
			name: artist.name,
			spotifyLink: artist.external_urls.spotify // Correct Spotify link for the artist
		})),
		album: {
			id: item.album.id,
			name: item.album.name,
			images: item.album.images.map((image) => ({
				url: image.url,
				height: image.height,
				width: image.width
			})),
			spotifyLink: item.album.external_urls.spotify // Correct Spotify link for the album
		},
		preview_url: item.preview_url, // Preview URL, if available
		uri: item.uri, // Internal Spotify URI (for Spotify apps)
		spotifyLink: item.external_urls.spotify // Correct Spotify link for the track
	}));
}
