// Runtime feature flags (process.env, no rebuild needed). Each one has a default that keeps
// today's behaviour, so an .env without the variable changes nothing.

import { isFlagEnabled } from './flagValue';

export { isFlagEnabled };

// SPOTIFY_CONNECT_ENABLED lived here until per-account Spotify connect was retired (ROADMAP
// section 1); the server no longer reads it. GET /api/mobile/config still answers
// spotifyConnectEnabled: false for app builds that ask.
