import { cookieManager } from '$lib/cookieManager';
import { isSpotifyConnectEnabled } from '$lib/featureFlags';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const hasAccessToken = !!cookieManager.get(cookies, 'spotifyAccessToken');
	const hasSoundCloudAccessToken = !!cookieManager.get(cookies, 'soundcloud_access_token');
	const hasTidalAccessToken = !!cookieManager.get(cookies, 'tidal_access_token');

	// The city and date of the last search (set by /storestate, httpOnly), so coming back to
	// the page ("Change the vibe" on /clubs and /barfindr) does not ask for them again. The
	// city came back already; the date used to reset to today (KNOWN_ISSUES 24).
	const rememberedCity = cookies.get('city') ?? '';
	const dateCookie = cookies.get('date') ?? '';
	const rememberedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateCookie) ? dateCookie : '';

	// The Spotify login callback (and other flows) redirect here with ?error=<message> when
	// something went wrong; the page shows it, it was silently dropped before.
	const errorMessage = url.searchParams.get('error')?.trim() || '';

	return {
		hasAccessToken,
		hasSoundCloudAccessToken,
		hasTidalAccessToken,
		rememberedCity,
		rememberedDate,
		errorMessage,
		spotifyConnectEnabled: isSpotifyConnectEnabled()
	};
};
