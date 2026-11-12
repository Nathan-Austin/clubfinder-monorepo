import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	// The genres of the artists this visitor last picked on the guest search
	// (POST /api/spotify/artists stores them in this cookie; it expires after a day)
	const stored = cookies.get('spotify-genres');
	const genresList = stored ? stored.split(',').filter((genre) => genre.length > 0) : [];

	return {
		genresList
	};
};
