import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
	// Get the genres that were just fetched from the Spotify API
	const response = await fetch('/api/spotify/artists', {
		method: 'GET'
	});

	if (!response.ok) {
		throw new Error('Failed to fetch genres');
	}

	const data = await response.json();
	const genresList = data.genresList || [];

	// Store these Spotify-generated genres in a new cookie called 'spotify-genres'
	// This allows us to keep them separate from user-selected genres
	cookies.set('spotify-genres', genresList.join(','), {
		path: '/',
		maxAge: 60 * 60 * 24 // 24 hours
	});

	return {
		genresList: genresList
	};
};
