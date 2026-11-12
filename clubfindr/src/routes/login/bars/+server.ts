// This file is responsible for handling the login of bar managers
// route: /login/bars/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { comparePassword } from '$lib/server/passwordUtils';
import { normalizeCityName } from '$lib/cityName';

export const POST: RequestHandler = async ({ request, cookies }) => {
	console.log('=== Starting login process ===');

	const { email, password } = await request.json();
	console.log('Received login attempt for:', email);

	try {
		// Step 1: Try to authenticate as a regular user or promoter
		const userResult = await query(
			'SELECT id, password_hash, city, role, is_promoter FROM clubfindr.users WHERE general_email = $1',
			[email]
		);

		// Step 2: Try to authenticate as a bar manager with additional fields
		const barManagerResult = await query(
			`SELECT b.id, b.password_hash, b.city, b.name
             FROM clubfindr.bars b
             WHERE b.general_email = $1`,
			[email]
		);

		// If email doesn't exist in either table
		if ((userResult?.rowCount ?? 0) === 0 && (barManagerResult?.rowCount ?? 0) === 0) {
			console.log('User not found:', email);
			return new Response(JSON.stringify({ success: false, message: 'User not found' }), {
				status: 401
			});
		}

		// Check credentials and set appropriate cookies
		let validCredentials = false;
		let isPromoter = false;
		let isBarManager = false;
		let userId = null;
		let normalizedCityName = null;

		// Check user table credentials
		if ((userResult?.rowCount ?? 0) > 0) {
			const userData = userResult.rows[0];
			const storedUserPassword = userData.password_hash;
			const isUserPasswordCorrect = await comparePassword(password, storedUserPassword);

			if (isUserPasswordCorrect) {
				console.log('Regular user password correct');
				validCredentials = true;
				userId = userData.id;
				normalizedCityName = normalizeCityName(userData.city);
				isPromoter = userData.is_promoter;

				// Set common cookies
				cookies.set('userId', userId, {
					path: '/',
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				cookies.set('city', normalizedCityName, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				// If user is a promoter, set promoter cookie
				if (isPromoter) {
					cookies.set('promoterId', userId, {
						path: '/',
						secure: true,
						sameSite: 'lax',
						maxAge: 60 * 60 * 24 * 7 // 1 week
					});
				}
			} else {
				console.log('Regular user password incorrect');
			}
		}

		// Check bar manager credentials
		if ((barManagerResult?.rowCount ?? 0) > 0) {
			const barData = barManagerResult.rows[0];
			const storedBarPassword = barData.password_hash;
			const isBarPasswordCorrect = await comparePassword(password, storedBarPassword);

			if (isBarPasswordCorrect) {
				console.log('Bar manager password correct');
				validCredentials = true;
				isBarManager = true;
				const barId = barData.id;
				const barName = barData.name;
				normalizedCityName =
					normalizedCityName || (barData.city ? normalizeCityName(barData.city) : '');

				// Bar manager cookies. A venue is never sent through Spotify any more: the venue
				// connect (and spotify_service add_bar) was retired with ROADMAP section 1.
				cookies.set('barId', barId, {
					path: '/',
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				cookies.set('bar_email', email, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				cookies.set('barsName', barName, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				cookies.set('bar_city', normalizedCityName, {
					path: '/',
					httpOnly: true,
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});

				// Continue to the bars page
				console.log('=== Sending successful login response, redirecting to /bars ===');

				// Create headers and add cookies
				const headers = new Headers();
				headers.append('Content-Type', 'application/json');

				// Get all cookies and explicitly set them in response headers
				const allCookies = cookies.getAll();
				console.log(`Adding ${allCookies.length} cookies to response headers`);

				for (const cookie of allCookies) {
					// Basic cookie serialization
					const cookieValue = `${cookie.name}=${cookie.value}; Path=/`;
					headers.append('Set-Cookie', cookieValue);
					console.log(`Added cookie to response: ${cookie.name}`);
				}

				return new Response(JSON.stringify({ success: true, redirectUrl: '/bars' }), {
					status: 200,
					headers
				});
			} else {
				console.log('Bar manager password incorrect');
			}
		}

		// Handle role determination and response - this only executes if we haven't returned yet
		if (validCredentials) {
			// Set a cookie if user has dual roles
			if (isPromoter && isBarManager) {
				cookies.set('hasDualRole', 'true', {
					path: '/',
					secure: true,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 7 // 1 week
				});
			}

			// Determine where to redirect the user
			// Priority: Bar Manager > Promoter > Regular User
			if (isBarManager) {
				console.log('=== Sending successful login response for bar manager ===');
				return new Response(JSON.stringify({ success: true, redirectUrl: '/bars' }), {
					status: 200
				});
			} else if (isPromoter) {
				console.log('=== Sending successful login response for promoter ===');
				return new Response(JSON.stringify({ success: true, redirectUrl: '/promoter-home' }), {
					status: 200
				});
			} else {
				// Regular user shouldn't be using this login method
				console.log('=== Redirecting regular user to correct login page ===');
				return new Response(
					JSON.stringify({
						success: false,
						message: 'Please use the regular user login',
						redirectUrl: '/login/users'
					}),
					{
						status: 303 // See Other - redirect to different resource
					}
				);
			}
		}

		// Check if it's a regular user trying to use partner login
		const regularUserCheck = await query(
			'SELECT id FROM clubfindr.users WHERE general_email = $1 AND is_promoter = false AND (role IS NULL OR role != $2)',
			[email, 'manager']
		);

		if ((regularUserCheck?.rowCount ?? 0) > 0) {
			// This is a regular user trying to use the partner login
			console.log('=== Regular user using partner login, redirecting to user login ===');
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Please use the regular user login',
					redirectUrl: '/login/users'
				}),
				{
					status: 303 // See Other - redirect to different resource
				}
			);
		} else {
			// Truly invalid credentials for partner login
			console.log('=== Invalid credentials ===');
			return new Response(JSON.stringify({ success: false, message: 'Invalid credentials' }), {
				status: 401
			});
		}
	} catch (error) {
		console.error('Error during login:', error);
		return new Response(JSON.stringify({ success: false, message: 'Error during login' }), {
			status: 500
		});
	}
};
