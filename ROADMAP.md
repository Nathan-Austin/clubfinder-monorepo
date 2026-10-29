# Roadmap

Planned work for the Clubfinder monorepo. Detailed findings live in
[`docs/analysis/`](docs/analysis/README.md) and
[`clubfindr/docs/KNOWN_ISSUES.md`](clubfindr/docs/KNOWN_ISSUES.md); this file is the
ordered list of what I intend to do next.

## 1. Move away from Spotify for users

Spotify's development-mode limits cap each app at a handful of users, so per-user
Spotify integration no longer scales.

The goal: a new user gets useful personalised results in under a minute without
connecting any streaming account, and results get better the more they use the app.
Per-user Spotify connect goes; one server-side Spotify app stays, for artist data only.

- [ ] Retire `spotify_service` (automated Spotify developer app management) and its
      systemd units, cron jobs and deploy steps
- [ ] Keep a single Spotify app for server-side artist data lookups only
- [ ] Make Last.fm import and manual genre picks the main ways to build a taste profile
- [ ] Artist picker onboarding as the default signup path: the user names 3-5 artists,
      autocomplete goes through the server-side Spotify app (`spotifyArtistLookup.ts`),
      and the genres of those artists feed the taste profile
- [ ] Genre fallback for picked artists from Last.fm `toptags` or MusicBrainz tags, in
      case Spotify artist objects stop carrying `genres` (KNOWN_ISSUES 21)
- [ ] Remove the Spotify connect step from web and mobile signup (`musicService` choice,
      `spotify_service` add_user call; KNOWN_ISSUES 24)
- [ ] Fix `/bars` so a venue can create events without connecting Spotify (KNOWN_ISSUES 4)
- [ ] Venues set their genres and typical artists by hand through the same picker, and
      `barfindr` stops polling venue Spotify playback
- [ ] Verify Spotify and Last.fm responses against the live APIs and run
      `SPOTIFY_CONNECT_ENABLED=false` end to end (KNOWN_ISSUES 21)

## 2. Genre matching and taste profiles

- [ ] Add a genre alias layer and de-duplicate cluster leaves (KNOWN_ISSUES 18)
- [ ] Unify the four copies of the cluster matcher into `$lib` and wire the taste
      profile into the mobile API (KNOWN_ISSUES 22)
- [ ] Match the same artist across providers by more than name (KNOWN_ISSUES 19)
- [ ] Fix `/api/spotify/artists` sharing its last result between users (KNOWN_ISSUES 23)

## 3. More ways to build a taste profile

- [ ] ListenBrainz import by username (public stats API, same shape as the Last.fm import)
- [ ] Upload a Spotify privacy data export (streaming history JSON), count artists and
      feed the profile; an upgrade path, not onboarding, since the export takes days
- [ ] Learn from in-app behaviour: interested events, check-ins (`api/mobile/checkin`),
      maybe a thumbs up/down after a night, nudging genre weights
- [ ] "Nights like these" genre picker that shows sample events or artists per cluster
      instead of bare cluster names

Ruled out: Spotify playlist link paste (development mode only returns playlists the user
owns), Deezer (new API access closed since 2025), Apple Music (paid developer account, no
top artists or play counts on the web).

## 4. Correctness and security (web app)

- [ ] Keep Postgres `DATE` values as `YYYY-MM-DD` end to end and use the local day in the
      mobile API (KNOWN_ISSUES 17)
- [ ] Route `/api/request-access` through `$lib/email` and enable SMTP certificate
      verification (KNOWN_ISSUES 15, 16)
- [ ] `/api/delete-user-data` should also clear preferences and interested events
      (KNOWN_ISSUES 24)
- [ ] Store the refreshed Spotify token expiry (KNOWN_ISSUES 2), or drop the flow with section 1
- [ ] Input validation on all API endpoints and an audit of raw SQL
- [ ] Reduce request logging in `hooks.server.ts` (KNOWN_ISSUES 12)

## 5. Mobile app (`app_clubfindr`)

- [ ] Unit tests for the services layer
- [ ] Replace `any` types and gate `console.log` for production builds
- [ ] Split screen components over 500 lines
- [ ] Loading states and network error recovery
- [ ] Finish the QR scanner flow to open venue details
- [ ] Configure Sentry for production with source maps

## 6. Data pipeline (`data_collection`)

- [ ] Replace pickle files with JSON
- [ ] Retry with backoff and checkpointing so a failed run can resume
- [ ] Move hardcoded paths and cities into configuration
- [ ] Remove `oldScripts/` and other unused scripts
- [ ] Tests for the scraping and enrichment steps

## 7. `barfindr` scaling

Only relevant if `barfindr` keeps polling venues after section 1.

- [ ] Process venues in parallel chunks instead of one sequential loop
- [ ] Move 24-hour genre aggregation into SQL instead of loading rows into memory

See [`docs/analysis/barfindr-technical-analysis.md`](docs/analysis/barfindr-technical-analysis.md).

## 8. Housekeeping

- [ ] Replace colour classes outside the palette with real tokens (KNOWN_ISSUES 7)
- [ ] Swap `jsonwebtoken` for `jose` before the next Node upgrade (KNOWN_ISSUES 10)
- [ ] One documented convention for runtime vs build-time config (KNOWN_ISSUES 20)
- [ ] Bring `docs/analysis/` up to date with what has been fixed since January
