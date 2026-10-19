// api/mobile/bar/login/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { comparePassword } from '$lib/server/passwordUtils';
import { decryptToken, encryptToken } from '$lib/encryptionUtils';
import { refreshSpotifyToken } from '$lib/spotifyUtils';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	console.log('========================');
	console.log('MOBILE BAR LOGIN REQUEST');
	console.log('========================');

	try {
		// Parse request body
		const data = await request.json();
		console.log('Request parsing:', Date.now() - startTime, 'ms');

		const { email, password, platform, version } = data;

		// Basic validation
		if (!email || !password) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Missing email or password'
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Get bar manager from database with all relevant fields
		const dbStart = Date.now();
		const result = await query(
			`SELECT 
                b.id, b.password_hash, b.city, b.name, b.general_email,
                b.address, b.phone, b.opening_hours, b.closing_hours, b.description, b.website,
                b.spotify_access_token, b.spotify_refresh_token, b.updated_at, 
                b.spotify_app_name, b.spotify_email, b.music_service, b.confirmed as email_verified,
                b.contact_person, b.postcode,
                sa.client_id, sa.client_secret
             FROM clubfindr.bars b 
             LEFT JOIN clubfindr.spotify_apps sa ON b.spotify_app_name = sa.app_name
             WHERE b.general_email = $1`,
			[email]
		);
		console.log('Database lookup:', Date.now() - dbStart, 'ms');

		if (!result.rows || result.rows.length === 0) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid credentials'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		const barData = result.rows[0];

		// Check if email is verified
		if (!barData.email_verified) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Email not verified. Please check your email for verification instructions.'
				}),
				{
					status: 403,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
		console.log('bardata muisic service', barData.music_service);
		console.log('spotify_app_name', barData.spotify_app_name);
		console.log('client_id', barData.client_id);
		console.log('client_secret', barData.client_secret);
		// Check password
		const passwordStart = Date.now();
		const storedHashedPassword = barData.password_hash;
		const isPasswordCorrect = await comparePassword(password, storedHashedPassword);
		console.log('Password verification:', Date.now() - passwordStart, 'ms');

		if (!isPasswordCorrect) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid credentials'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Generate token for mobile session
		const tokenStart = Date.now();
		const barId = barData.id;
		const sessionId = uuidv4();
		console.log('Token generation:', Date.now() - tokenStart, 'ms');

		// Check if we need to refresh Spotify tokens
		let spotifyTokensReady = false;
		let spotify_access_token = null;
		let spotify_refresh_token = null;

		if (barData.music_service === 'spotify' && barData.spotify_access_token) {
			try {
				spotify_access_token = barData.spotify_access_token
					? decryptToken(barData.spotify_access_token)
					: null;
				spotify_refresh_token = barData.spotify_refresh_token
					? decryptToken(barData.spotify_refresh_token)
					: null;

				if (spotify_access_token && spotify_refresh_token) {
					// Check if tokens need refreshing
					const oneHourAgo = new Date(Date.now() - 3600 * 1000);
					if (!barData.updated_at || new Date(barData.updated_at) < oneHourAgo) {
						console.log('Tokens may be expired, attempting to refresh');
						const newTokenData = await refreshSpotifyToken({
							refreshToken: spotify_refresh_token
						});

						if (newTokenData.success) {
							spotify_access_token = newTokenData.access_token;
							const encryptedNewAccessToken = encryptToken(spotify_access_token);
							await query(
								`UPDATE clubfindr.bars 
                                SET spotify_access_token = $1, updated_at = $2
                                WHERE id = $3`,
								[encryptedNewAccessToken, new Date().toISOString(), barId]
							);
							console.log('Successfully refreshed Spotify tokens');
							spotifyTokensReady = true;
						}
					} else {
						// Tokens are still valid
						spotifyTokensReady = true;
					}
				}
			} catch (tokenError) {
				console.error('Error processing Spotify tokens:', tokenError);
				// Continue without Spotify tokens
			}
		}

		// Prepare bar data for response
		const barDataResponse = {
			id: barId,
			name: barData.name,
			address: barData.address || null,
			postcode: barData.postcode || null,
			city: barData.city,
			email: barData.general_email,
			phone: barData.phone || null,
			contact_person: barData.contact_person,
			description: barData.description || null,
			opening_hours: barData.opening_hours || null,
			closing_hours: barData.closing_hours || null,
			website: barData.website || null
		};

		// Launch session creation in background
		createBarSession(sessionId, barId, platform, version).catch((error) => {
			console.error('Background session creation failed:', error);
		});

		// Create response with relevant Spotify info if needed
		const responseBody = {
			success: true,
			token: sessionId,
			barData: barDataResponse
		};

		// For established Spotify connections
		if (barData.music_service?.toLowerCase() === 'spotify' && spotifyTokensReady) {
			Object.assign(responseBody, {
				spotify: {
					ready: true,
					access_token: spotify_access_token,
					refresh_token: spotify_refresh_token,
					app_name: barData.spotify_app_name,
					client_id: barData.client_id,
					client_secret: barData.client_secret,
					userType: 'bar'
				}
			});
		}
		// For first-time Spotify setup
		else if (barData.music_service?.toLowerCase() === 'spotify') {
			Object.assign(responseBody, {
				spotify: {
					ready: false,
					app_name: barData.spotify_app_name,
					client_id: barData.client_id,
					client_secret: barData.client_secret
				}
			});
		}

		console.log('Total processing time:', Date.now() - startTime, 'ms');
		console.log('Response body:', responseBody);
		// Return success response immediately
		return new Response(JSON.stringify(responseBody), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Bar login error:', error);
		return new Response(
			JSON.stringify({
				success: false,
				message: 'Server error'
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

// Background function to create bar session without blocking the response
async function createBarSession(
	sessionId: string,
	barId: string,
	platform?: string,
	version?: string
) {
	const startTime = Date.now();
	try {
		// Delete any existing sessions first
		await query('DELETE FROM clubfindr.bar_sessions WHERE bar_id = $1', [barId]);
		console.log(`Session deletion took: ${Date.now() - startTime}ms`);

		// Create the new session
		const insertStart = Date.now();
		await query(
			`
            INSERT INTO clubfindr.bar_sessions (
                session_id, 
                bar_id,
                last_accessed,
                platform,
                version,
                is_mobile
            ) VALUES ($1, $2, $3, $4, $5, $6)
            `,
			[
				sessionId,
				barId,
				new Date().toISOString(),
				platform || 'unknown',
				version || 'unknown',
				true
			]
		);
		console.log(`Session creation took: ${Date.now() - insertStart}ms`);
		console.log(`Total background session handling: ${Date.now() - startTime}ms`);
	} catch (error) {
		console.error('Bar session creation error:', error);
	}
}
