// Server-side MusicBrainz settings for the genre fallback.
//
// Runtime settings ($env/dynamic), like the Last.fm and Spotify hosts, so the e2e suite can
// point the server at tests/mock-musicbrainz.ts without a rebuild. MusicBrainz needs no API
// key, so this is on by default; MUSICBRAINZ_ENABLED=false switches the step off.

import { env } from '$env/dynamic/private';
import { isFlagEnabled } from '$lib/featureFlags';
import type { MusicbrainzOptions } from './musicbrainz';

export function musicbrainzOptions(): MusicbrainzOptions | null {
	if (!isFlagEnabled(env.MUSICBRAINZ_ENABLED, true)) return null;
	return {
		apiBase: env.MUSICBRAINZ_API_BASE || undefined,
		userAgent: env.MUSICBRAINZ_USER_AGENT || undefined
	};
}
