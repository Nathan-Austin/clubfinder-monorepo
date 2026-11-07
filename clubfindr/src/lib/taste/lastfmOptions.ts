// Server-side Last.fm settings, shared by the import endpoint and the genre fallback.
//
// Runtime settings ($env/dynamic), so the e2e suite can point the server at
// tests/mock-lastfm.ts without a rebuild and a missing key cannot break a build. Returns null
// when there is no usable key: callers decide whether that is an error (the import says "not
// set up") or simply a step to skip (the genre fallback moves on to MusicBrainz).

import { env } from '$env/dynamic/private';
import type { LastfmOptions } from './lastfm';

/** The value .env.example ships with; treated as "no key". */
export const PLACEHOLDER_LASTFM_KEY = 'your-lastfm-api-key';

export function lastfmOptions(): LastfmOptions | null {
	const apiKey = env.LASTFM_API_KEY?.trim();
	if (!apiKey || apiKey === PLACEHOLDER_LASTFM_KEY) return null;
	return { apiKey, apiBase: env.LASTFM_API_BASE || undefined };
}
