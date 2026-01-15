// src/routes/storestate/store-state.ts
import type { RequestHandler } from '@sveltejs/kit';
import { setState } from '$lib/tempStore';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { key, state } = await request.json();
		console.log('state:', state);

		// Assuming state is a JSON string, parse it
		const stateData = JSON.parse(state);

		// Set the state using the key
		setState(key, state);

		// Set cookies
		if (stateData.city) {
			cookies.set('city', stateData.city, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}
		if (stateData.cityName) {
			cookies.set('bar-city', stateData.cityName, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}
		if (stateData.email) {
			cookies.set('email', stateData.email, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}
		if (stateData.businessName) {
			cookies.set('business-name', stateData.businessName, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}
		if (stateData.formattedDate) {
			cookies.set('date', stateData.formattedDate, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}

		if (stateData.address) {
			cookies.set('address', stateData.address, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}

		if (stateData.selectedGenre) {
			cookies.set('genre', stateData.selectedGenre, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}
		if (stateData.search) {
			cookies.set('search', stateData.search, {
				path: '/',
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				maxAge: 3600 // 1 hour
			});
		}

		return new Response(JSON.stringify({ message: 'State stored and cookies set' }), {
			status: 200
		});
	} catch (e) {
		console.error('Error storing state and setting cookies:', e);
		return new Response(JSON.stringify({ error: 'Failed to store state and set cookies' }), {
			status: 500
		});
	}
};
