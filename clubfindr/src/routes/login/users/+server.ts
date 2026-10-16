import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { comparePassword, hashPassword } from '$lib/passwordUtils';
import { normalizeCityName } from '$lib/spotifyUtils';
import { v4 as uuidv4 } from 'uuid';
import { addUserToSpotifyApp } from '$lib/spotifyService';
import { cookieManager } from '$lib/cookieManager';
import { PUBLIC_GOOGLE_OAUTH_CLIENT_ID } from '$env/static/public';

export const POST: RequestHandler = async ({ request, cookies }) => {
	console.log('========================');
	console.log('LOGIN REQUEST RECEIVED');
	console.log('========================');

	const startTime = Date.now();

	const data = await request.json();
	console.log('Request body:', {
		email: data.email ? 'PRESENT' : 'MISSING',
		password: data.password ? 'PRESENT' : 'MISSING',
		provider: data.provider,
		isMobileApp: data.isMobileApp || false
	});
	const {
		email,
		password,
		token,
		provider,
		isNewUser,
		fullName,
		spotifyEmail,
		isMobileApp = false // Make sure this is properly extracted from the request
	} = data;

	if (!provider) {
		return new Response(JSON.stringify({ success: false, message: 'Missing provider' }), {
			status: 400
		});
	}

	let user_id, normalizedCityName, userName;

	try {
		const dbCheckStart = Date.now();
		if (provider === 'local') {
			if (isNewUser) {
				// New user registration
				if (!email || !password || !fullName || !spotifyEmail) {
					return new Response(
						JSON.stringify({
							success: false,
							message: 'Missing required fields',
							isMobileResponse: isMobileApp
						}),
						{ status: 400 }
					);
				}

				// Check if user exists
				const existingUser = await query(
					'SELECT id FROM clubfindr.users WHERE general_email = $1 OR spotify_email = $2',
					[email, spotifyEmail]
				);

				if (existingUser.rows.length > 0) {
					return new Response(
						JSON.stringify({
							success: false,
							message: 'User already exists',
							isMobileResponse: isMobileApp
						}),
						{
							status: 400
						}
					);
				}

				// Create new user
				try {
					const hashedPassword = await hashPassword(password);
					const city = 'Berlin'; // Default city

					const newUserResult = await query(
						`INSERT INTO clubfindr.users 
						(general_email, password_hash, name, city, spotify_email) 
						VALUES ($1, $2, $3, $4, $5) 
						RETURNING id`,
						[email, hashedPassword, fullName, city, spotifyEmail]
					);

					user_id = newUserResult.rows[0].id;
					userName = fullName;
					normalizedCityName = normalizeCityName(city);
				} catch (error) {
					// Provide a better error message
					return new Response(
						JSON.stringify({
							success: false,
							message: `Password validation failed: ${
								error instanceof Error ? error.message : 'Unknown error'
							}`,
							isMobileResponse: isMobileApp
						}),
						{ status: 400 }
					);
				}
				// Add user to Spotify app
				try {
					await addUserToSpotifyApp(user_id, spotifyEmail);
				} catch (error) {
					console.error('Failed to add user to Spotify app:', error);
					// Continue with login even if Spotify app addition fails
				}
			} else {
				// Regular login
				if (!email || !password) {
					return new Response(
						JSON.stringify({
							success: false,
							message: 'Missing email or password',
							isMobileResponse: isMobileApp
						}),
						{ status: 400 }
					);
				}

				const result = await query(
					'SELECT password_hash, city, id, name FROM clubfindr.users WHERE general_email = $1',
					[email]
				);

				if (!result.rows || result.rows.length === 0) {
					return new Response(
						JSON.stringify({
							success: false,
							message: 'User not found',
							isMobileResponse: isMobileApp
						}),
						{
							status: 401
						}
					);
				}

				const storedHashedPassword = result.rows[0].password_hash;
				const isPasswordCorrect = await comparePassword(password, storedHashedPassword);

				if (!isPasswordCorrect) {
					return new Response(
						JSON.stringify({
							success: false,
							message: 'Invalid credentials',
							isMobileResponse: isMobileApp
						}),
						{
							status: 401
						}
					);
				}

				user_id = result.rows[0].id;
				userName = result.rows[0].name;
				normalizedCityName = normalizeCityName(result.rows[0].city);
			}
		} else if (provider === 'google') {
			// Existing Google login logic
			if (!token) {
				return new Response(
					JSON.stringify({
						success: false,
						message: 'Missing token for Google login',
						isMobileResponse: isMobileApp
					}),
					{ status: 400 }
				);
			}

			const googleResponse = await fetch(
				`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`
			);

			if (!googleResponse.ok) {
				return new Response(JSON.stringify({ success: false, message: 'Invalid Google token' }), {
					status: 401
				});
			}

			const userData = await googleResponse.json();
			if (userData.aud !== PUBLIC_GOOGLE_OAUTH_CLIENT_ID) {
				return new Response(
					JSON.stringify({ success: false, message: 'Invalid Google token audience' }),
					{ status: 401 }
				);
			}

			const { email: googleEmail, sub: googleId, name: googleName } = userData;

			const result = await query(
				'SELECT id, city, name FROM clubfindr.users WHERE general_email = $1 OR google_id = $2',
				[googleEmail, googleId]
			);

			if (!result.rows || result.rows.length === 0) {
				const city = 'Berlin';
				const newResult = await query(
					'INSERT INTO clubfindr.users (google_id, general_email, city, name) VALUES ($1, $2, $3, $4) RETURNING id',
					[googleId, googleEmail, city, googleName || 'Google User']
				);
				user_id = newResult.rows[0].id;
				userName = googleName || 'Google User';
				normalizedCityName = normalizeCityName(city);
			} else {
				const user = result.rows[0];
				await query('UPDATE clubfindr.users SET google_id = $1 WHERE general_email = $2', [
					googleId,
					googleEmail
				]);
				user_id = user.id;
				userName = user.name;
				normalizedCityName = normalizeCityName(user.city);
			}
		} else if (provider === 'facebook') {
			// Existing Facebook login logic preserved exactly as is
			if (!token) {
				return new Response(
					JSON.stringify({ success: false, message: 'Missing token for Facebook login' }),
					{ status: 400 }
				);
			}

			const fbResponse = await fetch(
				`https://graph.facebook.com/me?access_token=${token}&fields=email,id,name`
			);
			const userData = await fbResponse.json();

			if (!userData.id) {
				return new Response(JSON.stringify({ success: false, message: 'Invalid Facebook token' }), {
					status: 401
				});
			}

			const { email: facebookEmail, id: facebookId, name: facebookName } = userData;

			const result = await query(
				'SELECT id, city, name FROM clubfindr.users WHERE general_email = $1 OR facebook_id = $2',
				[facebookEmail, facebookId]
			);

			if (!result.rows || result.rows.length === 0) {
				const city = 'Berlin';
				const newResult = await query(
					'INSERT INTO clubfindr.users (facebook_id, general_email, city, name) VALUES ($1, $2, $3, $4) RETURNING id',
					[facebookId, facebookEmail, city, facebookName || 'Facebook User']
				);
				user_id = newResult.rows[0].id;
				userName = facebookName || 'Facebook User';
				normalizedCityName = normalizeCityName(city);
			} else {
				const user = result.rows[0];
				await query('UPDATE clubfindr.users SET facebook_id = $1 WHERE general_email = $2', [
					facebookId,
					facebookEmail
				]);
				user_id = user.id;
				userName = user.name;
				normalizedCityName = normalizeCityName(user.city);
			}
			console.log(`Provider authentication took: ${Date.now() - dbCheckStart}ms`);
		} else {
			return new Response(JSON.stringify({ success: false, message: 'Invalid provider' }), {
				status: 400
			});
		}
		const sessionStart = Date.now();
		// Delete any existing sessions for this user
		await query('DELETE FROM clubfindr.user_sessions WHERE user_id = $1', [user_id]);
		console.log(`Session deletion took: ${Date.now() - sessionStart}ms`);
		// Create a new session
		const sessionId = uuidv4();
		await query(
			`
            INSERT INTO clubfindr.user_sessions (
                session_id, 
                user_id, 
                user_city, 
                last_accessed,
                spotify_user_id,
                spotify_email,
                spotify_username
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
			[
				sessionId,
				user_id,
				normalizedCityName,
				new Date(),
				null, // spotify_user_id
				null, // spotify_email
				null // spotify_username
			]
		);

		// Check if this is a mobile app request
		if (isMobileApp) {
			// For mobile, return user data and token
			return new Response(
				JSON.stringify({
					success: true,
					isMobileApp: true,
					user: {
						id: user_id,
						email: email || spotifyEmail,
						name: userName,
						city: normalizedCityName
					},
					token: sessionId
				}),
				{
					status: 200,
					headers: {
						'Content-Type': 'application/json'
					}
				}
			);
		} else {
			// Set session cookie
			cookieManager.set(cookies, 'sessionId', sessionId, {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 24 * 60 * 60 // 1 day
			});

			// Set other necessary cookies
			cookies.set('isLoggedIn', 'true', {
				path: '/',
				httpOnly: false,
				secure: true,
				maxAge: 24 * 60 * 60
			});
			cookies.set('usersName', userName, {
				path: '/',
				httpOnly: false,
				secure: true,
				maxAge: 24 * 60 * 60
			});
			cookieManager.set(cookies, 'usersId', user_id, {
				path: '/',
				httpOnly: false,
				secure: true,
				maxAge: 24 * 60 * 60
			});
			console.log(`Total login processing time: ${Date.now() - startTime}ms`);
			console.log('========================');
			// Return success response
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}
	} catch (error) {
		console.error('Error during login:', error);
		return new Response(
			JSON.stringify({
				success: false,
				message: error instanceof Error ? error.message : 'Internal server error',
				isMobileResponse: isMobileApp
			}),
			{
				status: 500
			}
		);
	}
};
