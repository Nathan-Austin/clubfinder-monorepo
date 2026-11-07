// Tells the venue registration form whether to ask for a music service and its e-mail
// (SPOTIFY_CONNECT_ENABLED, src/lib/featureFlags.ts). The POST endpoint next to this page
// (+server.ts) enforces the same flag, so hiding the fields is not the only safeguard.

import type { PageServerLoad } from './$types';
import { isSpotifyConnectEnabled } from '$lib/featureFlags';

export const load: PageServerLoad = () => ({
	spotifyConnectEnabled: isSpotifyConnectEnabled()
});
