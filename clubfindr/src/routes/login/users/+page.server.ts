// Tells the login / signup form whether to offer the optional Spotify e-mail field
// (SPOTIFY_CONNECT_ENABLED, src/lib/featureFlags.ts). The POST endpoint next to this page
// (+server.ts) enforces the same flag, so hiding the field is not the only safeguard.

import type { PageServerLoad } from './$types';
import { isSpotifyConnectEnabled } from '$lib/featureFlags';

export const load: PageServerLoad = () => ({
	spotifyConnectEnabled: isSpotifyConnectEnabled()
});
