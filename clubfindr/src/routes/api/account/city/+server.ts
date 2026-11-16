// The logged-in user's city (KNOWN_ISSUES 67): which city's venues and events they are shown.
//
//   GET /api/account/city              -> { city, cities: [{ name, slug }] }
//   PUT /api/account/city { city }     -> { city }   (a name or slug from $lib/cities)
//
// Web (session cookie) and app (Bearer token, the same user_sessions id) alike. Until
// 2026-11-16 nothing wrote users.city after sign-up, so a wrong city could only be fixed in the
// database. Writing it also moves the user's session (user_sessions.user_city, which the
// /clubs and /barfindr selections are keyed by) and the web's `city` cookie, so the new city
// applies at once, with no new login.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import { LIVE_CITIES, findLiveCity } from '$lib/cities';
import { readJsonObject } from '$lib/server/validate';

const CITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // as /login/users sets it

const cityList = () => LIVE_CITIES.map(({ name, slug }) => ({ name, slug }));

export const GET: RequestHandler = async ({ cookies, request }) => {
	const userId = await getSessionUserId(cookies, pool, request);
	if (!userId) return json({ success: false, message: 'Not logged in' }, { status: 401 });

	const result = await pool.query('SELECT city FROM clubfindr.users WHERE id = $1', [userId]);
	const stored = result.rows[0]?.city;
	return json({ success: true, city: findLiveCity(stored)?.slug ?? null, cities: cityList() });
};

export const PUT: RequestHandler = async ({ cookies, request }) => {
	const userId = await getSessionUserId(cookies, pool, request);
	if (!userId) return json({ success: false, message: 'Not logged in' }, { status: 401 });

	const city = findLiveCity((await readJsonObject(request))?.city);
	if (!city) {
		return json(
			{ success: false, message: 'Choose one of the cities we cover', cities: cityList() },
			{ status: 400 }
		);
	}

	await pool.query('UPDATE clubfindr.users SET city = $1, updated_at = NOW() WHERE id = $2', [
		city.slug,
		userId
	]);
	await pool.query('UPDATE clubfindr.user_sessions SET user_city = $1 WHERE user_id = $2', [
		city.slug,
		userId
	]);
	cookies.set('city', city.slug, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: CITY_COOKIE_MAX_AGE
	});

	return json({ success: true, city: city.slug });
};
