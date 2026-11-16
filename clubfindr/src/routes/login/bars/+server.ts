// This file is responsible for handling the login of bar managers
// route: /login/bars/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { pool } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';
import { BAR_SESSION_COOKIE, createBarSession } from '$lib/taste/barSession';
import { USER_SESSION_COOKIE, createPromoterSession } from '$lib/server/promoterAuth';
import { findVenueLogin } from '$lib/server/venueLogin';
import { normalizeCityName } from '$lib/cityName';
import {
	SAY,
	email as emailCheck,
	fields,
	password as passwordCheck,
	readJsonObject
} from '$lib/server/validate';

export const POST: RequestHandler = async ({ request, cookies }) => {
	console.log('=== Starting login process ===');

	// Checked before any query: a body that was not JSON threw here, outside the try (500), and
	// any other type went straight into the lookups (ROADMAP section 4)
	const body = await readJsonObject(request);
	const input = fields({ email: emailCheck(body?.email), password: passwordCheck(body?.password) });
	if (!input.ok) {
		return new Response(JSON.stringify({ success: false, message: SAY.login }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	const { email, password } = input.value;
	console.log('Partner login attempt');

	try {
		// One lookup for the web and the app ($lib/server/venueLogin): a personal account and the
		// venue it registered (bars.user_id), else the venue's own login, a confirmed venue only.
		// Before 2026-11-16 a personal account here never opened a venue, and an unconfirmed
		// venue got in (the app refused it) (KNOWN_ISSUES 69).
		const login = await findVenueLogin(pool, email, password);
		const cookieOptions = {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax' as const,
			maxAge: 60 * 60 * 24 * 7 // 1 week
		};
		const isPromoter = login.user?.is_promoter === true;
		let normalizedCityName = login.user?.city ? normalizeCityName(login.user.city) : '';

		if (login.user) {
			console.log('Partner login: personal account password correct');
			cookies.set('userId', login.user.id, { ...cookieOptions, httpOnly: false });
			cookies.set('city', normalizedCityName, cookieOptions);

			// A promoter's session: a user_sessions row (the same kind /login/users creates) in
			// the encrypted httpOnly `sessionId` cookie. This is what /promoter-home and its
			// event endpoints check ($lib/server/promoterAuth). The `promoterId` cookie below is
			// only for the layout's partner menu and is never trusted: until 2026-11-14 it was
			// the whole of promoter auth, plain and forgeable (KNOWN_ISSUES 51).
			if (isPromoter) {
				const sessionId = await createPromoterSession(pool, login.user.id);
				cookieManager.set(cookies, USER_SESSION_COOKIE, sessionId, {
					maxAge: 60 * 60 * 24 * 7 // 1 week; the session itself expires 7 days after last use
				});
				cookies.set('promoterId', login.user.id, cookieOptions);
			}
		}

		if (login.venue) {
			console.log('Partner login: venue opened via', login.via);
			const barId = login.venue.id;
			normalizedCityName =
				normalizedCityName || (login.venue.city ? normalizeCityName(login.venue.city) : '');

			// The venue's session: a bar_sessions row, the same kind the app's Bearer token
			// is, in an encrypted httpOnly cookie. This is what the venue write guards check
			// (canManageBar); the plain barId cookie below is only for the dashboard's own
			// display and is never trusted (KNOWN_ISSUES 52).
			const barSessionId = await createBarSession(pool, barId);
			cookieManager.set(cookies, BAR_SESSION_COOKIE, barSessionId, {
				maxAge: 60 * 60 * 24 * 7 // 1 week; the session itself slides for 30 days
			});
			cookies.set('barId', barId, { ...cookieOptions, httpOnly: false });
			cookies.set('bar_email', login.venue.general_email, cookieOptions);
			cookies.set('barsName', login.venue.name, cookieOptions);
			cookies.set('bar_city', normalizedCityName, cookieOptions);
			if (isPromoter) cookies.set('hasDualRole', 'true', { ...cookieOptions, httpOnly: false });

			// SvelteKit sends every cookies.set() above with its own flags. This used to copy
			// each cookie into a bare `Set-Cookie: name=value; Path=/` as well, which dropped
			// HttpOnly and Secure (KNOWN_ISSUES 53).
			return json({ success: true, redirectUrl: '/bars' });
		}

		if (isPromoter) {
			return json({ success: true, redirectUrl: '/promoter-home' });
		}

		if (login.unconfirmed) {
			return json(
				{
					success: false,
					message: 'Please confirm your venue registration first: check your e-mail for the code.'
				},
				{ status: 403 }
			);
		}

		if (login.user) {
			// A regular account with no venue: this is the partner login
			return json(
				{
					success: false,
					message: 'Please use the regular user login',
					redirectUrl: '/login/users'
				},
				{ status: 303 }
			);
		}

		return json({ success: false, message: 'Invalid credentials' }, { status: 401 });
	} catch (error) {
		console.error('Error during login:', error);
		return new Response(JSON.stringify({ success: false, message: 'Error during login' }), {
			status: 500
		});
	}
};
