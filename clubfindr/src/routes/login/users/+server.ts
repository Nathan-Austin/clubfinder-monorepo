import type { RequestHandler } from '@sveltejs/kit';
import { openUserSession } from '$lib/server/userSessions';
import { query } from '$lib/db';
import { comparePassword, hashPassword } from '$lib/server/passwordUtils';
import { normalizeCityName } from '$lib/cityName';
import { v4 as uuidv4 } from 'uuid';
import { cookieManager } from '$lib/cookieManager';
import { PUBLIC_GOOGLE_OAUTH_CLIENT_ID } from '$env/static/public';
import { pool } from '$lib/db';
import { countFavouriteArtists } from '$lib/taste/favouriteArtists';
import { artistOnboardingStatus } from '$lib/taste/onboarding';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const data = await request.json();
	const {
		email,
		password,
		token,
		provider,
		isNewUser,
		fullName,
		isMobileApp = false // Make sure this is properly extracted from the request
	} = data;

	if (!provider) {
		return new Response(JSON.stringify({ success: false, message: 'Missing provider' }), {
			status: 400
		});
	}

	let user_id, normalizedCityName, userName;
	// Set when this request created the account; the web client then goes to /onboarding
	let newAccount = false;

	try {
		if (provider === 'local') {
			if (isNewUser) {
				// New user registration. Taste comes from the taste profile (artist picker, Last.fm
				// import), so signing up asks for no streaming account; a spotifyEmail an older
				// client still sends is ignored (per-user Spotify connect is retired).
				if (!email || !password || !fullName) {
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
					'SELECT id FROM clubfindr.users WHERE general_email = $1',
					[email]
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
					// No default city (owner's decision 2026-11-18): a new account starts without
					// one, and /users-home proposes the nearest covered city on the first visit
					const newUserResult = await query(
						`INSERT INTO clubfindr.users 
						(general_email, password_hash, name, city)
						VALUES ($1, $2, $3, '')
						RETURNING id`,
						[email, hashedPassword, fullName]
					);

					user_id = newUserResult.rows[0].id;
					newAccount = true;
					userName = fullName;
					normalizedCityName = '';
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
				// An account may have no city yet; /users-home proposes one
				normalizedCityName = result.rows[0].city ? normalizeCityName(result.rows[0].city) : '';
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
				// No default city (owner's decision 2026-11-18); /users-home proposes one
				const newResult = await query(
					"INSERT INTO clubfindr.users (google_id, general_email, city, name) VALUES ($1, $2, '', $3) RETURNING id",
					[googleId, googleEmail, googleName || 'Google User']
				);
				user_id = newResult.rows[0].id;
				newAccount = true;
				userName = googleName || 'Google User';
				normalizedCityName = '';
			} else {
				const user = result.rows[0];
				await query('UPDATE clubfindr.users SET google_id = $1 WHERE general_email = $2', [
					googleId,
					googleEmail
				]);
				user_id = user.id;
				userName = user.name;
				normalizedCityName = user.city ? normalizeCityName(user.city) : '';
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
				// No default city (owner's decision 2026-11-18); /users-home proposes one
				const newResult = await query(
					"INSERT INTO clubfindr.users (facebook_id, general_email, city, name) VALUES ($1, $2, '', $3) RETURNING id",
					[facebookId, facebookEmail, facebookName || 'Facebook User']
				);
				user_id = newResult.rows[0].id;
				newAccount = true;
				userName = facebookName || 'Facebook User';
				normalizedCityName = '';
			} else {
				const user = result.rows[0];
				await query('UPDATE clubfindr.users SET facebook_id = $1 WHERE general_email = $2', [
					facebookId,
					facebookEmail
				]);
				user_id = user.id;
				userName = user.name;
				normalizedCityName = user.city ? normalizeCityName(user.city) : '';
			}
		} else {
			return new Response(JSON.stringify({ success: false, message: 'Invalid provider' }), {
				status: 400
			});
		}
		// A session of its own for this login: the phone's and the browser's live side by side
		// (KNOWN_ISSUES 95; one row per account until 2026-11-19)
		const sessionId = uuidv4();
		await openUserSession(pool, sessionId, user_id, normalizedCityName);

		// Check if this is a mobile app request
		if (isMobileApp) {
			// For mobile, return user data and token
			return new Response(
				JSON.stringify({
					success: true,
					isMobileApp: true,
					user: {
						id: user_id,
						email,
						name: userName,
						city: normalizedCityName,
						// Same as /api/mobile/login, which the app tries first
						artistOnboarding: artistOnboardingStatus(await countFavouriteArtists(pool, user_id))
					},
					token: sessionId,
					// Always false now; kept for app builds that still read it
					spotifyConnectEnabled: false
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
			// Return success response
			return new Response(JSON.stringify({ success: true, newAccount }), { status: 200 });
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
