import { cookieManager } from '$lib/cookieManager';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const hasAccessToken = !!cookieManager.get(cookies, 'spotifyAccessToken');

	return {
		hasAccessToken
	};
};
