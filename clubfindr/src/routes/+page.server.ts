import { cookieManager } from '$lib/cookieManager';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const hasAccessToken = !!cookieManager.get(cookies, 'spotifyAccessToken');
	const hasSoundCloudAccessToken = !!cookieManager.get(cookies, 'soundcloud_access_token');

	return {
		hasAccessToken,
		hasSoundCloudAccessToken
	};
};
