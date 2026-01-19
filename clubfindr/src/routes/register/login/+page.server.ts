import { PUBLIC_SPOTIFY_CLIENT_ID } from '$env/static/public';
import { VITE_SPOTIFY_CLIENT_SECRET } from '$env/static/private';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { v4 as uuidv4 } from 'uuid';
import { createSession } from '$lib/session';

import { cookieManager } from '$lib/cookieManager';

export const load: PageServerLoad = async ({ cookies, fetch, url }) => {
	const code = url.searchParams.get('code');

	if (code) {
		const body = new URLSearchParams({
			grant_type: 'authorization_code',
			code: code,
			redirect_uri: 'https://www.clubfindr.com/register/login'
		});

		try {
			const response = await fetch('https://accounts.spotify.com/api/token', {
				method: 'POST',
				headers: {
					Authorization: `Basic ${Buffer.from(
						`${PUBLIC_SPOTIFY_CLIENT_ID}:${VITE_SPOTIFY_CLIENT_SECRET}`,
						'utf-8'
					).toString('base64')}`,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch token: ${response.status} - ${await response.text()}`);
			}

			const { access_token, refresh_token } = await response.json();

			if (!access_token) {
				throw new Error('Access token not provided by Spotify');
			}

			if (!refresh_token) {
				console.warn('No refresh token provided by Spotify');
			}

			// Set Spotify tokens as cookies
			cookieManager.set(cookies, 'spotifyAccessToken', access_token, {
				path: '/',
				httpOnly: true,
				secure: true, //process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
			cookieManager.set(cookies, 'spotifyRefreshToken', refresh_token, {
				path: '/',
				httpOnly: true,
				secure: true, //process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 15552000 // 6 months in seconds
			});

			// Generate a session ID and store user session data
			const sessionId = uuidv4();

			await createSession({
				sessionId,
				spotifyUserData: {
					accessToken: access_token,
					refreshToken: refresh_token || ''
				}
			});

			// Store the session ID as a cookie
			cookieManager.set(cookies, 'sessionId', sessionId, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		} catch (e) {
			console.error('Error when fetching a token from Spotify', e);
			throw error(500, 'Something went wrong');
		}

		throw redirect(302, '/register/confirm');
	} else {
		console.warn('No code from Spotify');
		throw error(400, 'No code from Spotify');
	}
};
