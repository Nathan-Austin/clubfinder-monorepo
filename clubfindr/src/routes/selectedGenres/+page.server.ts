import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	// The genres of this visitor's last POST /api/spotify/artists, stored there as a cookie
	// (kept until /clubs or /barfindr reads and deletes it)
	const stored = cookies.get('spotify-genres');
	const genresList = stored ? stored.split(',').filter((genre) => genre.length > 0) : [];

	return {
		genresList
	};
};
