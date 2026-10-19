import { cookieManager } from '$lib/cookieManager';
import { isSpotifyConnectEnabled } from '$lib/featureFlags';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const hasAccessToken = !!cookieManager.get(cookies, 'spotifyAccessToken');
	const hasSoundCloudAccessToken = !!cookieManager.get(cookies, 'soundcloud_access_token');
	const hasTidalAccessToken = !!cookieManager.get(cookies, 'tidal_access_token');

	// The city of the last search (set by /storestate, httpOnly), so coming back to the page
	// ("Change the vibe" on /clubs and /barfindr) does not ask for the city again.
	const rememberedCity = cookies.get('city') ?? '';

	// The Spotify login callback (and other flows) redirect here with ?error=<message> when
	// something went wrong; the page shows it, it was silently dropped before.
	const errorMessage = url.searchParams.get('error')?.trim() || '';

	return {
		hasAccessToken,
		hasSoundCloudAccessToken,
		hasTidalAccessToken,
		rememberedCity,
		errorMessage,
		spotifyConnectEnabled: isSpotifyConnectEnabled()
	};
};
