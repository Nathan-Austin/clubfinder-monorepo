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
      (with `SPOTIFY_CONNECT_ENABLED=false` the server-side app is already the only one a user
      touches; the per-account and venue OAuth code stays behind the flag until it is retired)
- [ ] Make Last.fm import and manual genre picks the main ways to build a taste profile
      (the artist picker is the default signup path, and the Last.fm import and genre picker
      both feed matching; left open until the Spotify paths above actually go)
- [x] Artist picker onboarding as the default signup path: the user names 3-5 artists,
      autocomplete goes through the server-side Spotify app (`spotifyArtistLookup.ts`),
      and the genres of those artists feed the taste profile
      (web: `/onboarding`; app: `ArtistPickerScreen` after login, from `user.artistOnboarding`)
- [x] Genre fallback for picked artists from Last.fm `toptags` or MusicBrainz tags, in
      case Spotify artist objects stop carrying `genres` (KNOWN_ISSUES 21).
      `$lib/taste/genreFallback.ts`, applied when an artist is added; still only verified
      against the mocks, not the live APIs
- [x] Remove the Spotify connect step from web and mobile signup (`musicService` choice,
      `spotify_service` add_user call; KNOWN_ISSUES 24). Behind `SPOTIFY_CONNECT_ENABLED=false`
      (default still on), covering users and venues; the app reads `/api/mobile/config`
- [x] Fix `/bars` so a venue can create events without connecting Spotify (KNOWN_ISSUES 4)
- [ ] Venues set their genres and typical artists by hand through the same picker, and
      `barfindr` stops polling venue Spotify playback
      (picker done: `/api/venues/:barId/taste`, the bar dashboard and the app's bar dashboard;
      `barfindr` still polls)
- [x] Run `SPOTIFY_CONNECT_ENABLED=false` end to end (KNOWN_ISSUES 21): the whole Playwright
      suite passes with the flag off and with it on, against the mocks, on a database rebuilt
      from `dev/schema.sql` with every migration applied, following CI's steps (2026-11-08).
      That includes `signup-journey.spec.ts`, which signs up, picks artists and checks the
      clubs those genres reach, with no streaming account at any step (`clubfindr/dev/TESTING.md`)
- [ ] Verify Spotify, Last.fm and MusicBrainz responses against the **live** APIs
      (KNOWN_ISSUES 21). Everything so far is checked against `tests/mock-*.ts`, which follow
      the published shapes but were never captured from the services

### Follow-ups from the section 1 work

Things to do by hand or decide, collected while building the items above.

- [x] Apply `clubfindr/migrations/20261108_add_bar_favourite_artists.sql` to production: applied
      by hand with the deploy of `0dc724f` (2026-11-09). From the next deploy on, `deploy/deploy.sh`
      applies new migrations itself and only stops for destructive or failing ones
- [ ] Set `SPOTIFY_CONNECT_ENABLED=false` in the production `.env` when ready (default is on)
- [ ] Set `MUSICBRAINZ_USER_AGENT` in production to name the deployment and a contact
- [x] The two parallel branches each added `bar_favourite_artists` (same table, different
      migration file names); keep one file when merging. Resolved: `main` has only
      `20261108_add_bar_favourite_artists.sql`
- [ ] Feed the venue artists (`bar_favourite_artists`) into `/barfindr` matching; it still scores
      venues from `bar_genre_aggregates`, which `barfindr` fills by polling Spotify
- [ ] Nudge existing users with fewer than 3 favourite artists towards `/onboarding`; only new
      accounts are sent there
- [ ] Mobile bar API leftovers (KNOWN_ISSUES 26, 27): `spotify-connect` and `stats` auth, and the
      missing event edit route
- [ ] Verify the reCAPTCHA on the server for `/register` (KNOWN_ISSUES 28)
- [ ] Fix `app_clubfindr` type checking, add a test runner and make its CI able to fail
      (KNOWN_ISSUES 29). The app's new artist picker is type-checked and its production
      bundle builds (`npx expo export`), but it has never run on a device or simulator

### Done on 2026-11-09 (deploy and operations)

- [x] Section 1 work deployed to production (`0dc724f`, then `fb57d11`), with the
      `bar_favourite_artists` migration applied
- [x] `deploy/deploy.sh` applies new `clubfindr/migrations/*.sql` itself, each in a transaction,
      before the checkout moves; it still stops for destructive or failing migrations and when
      the database is unreachable (`deploy/README.md`, "Deploys")
- [x] Rate limiting keys on the real visitor IP again: production's `ADDRESS_HEADER` had a
      trailing `.`, so every visitor shared the `unknown` bucket (KNOWN_ISSUES 5). The app now
      logs once when the client address is missing
- [x] clubfindr listens on `127.0.0.1:3000` only; `deploy/ufw-rules.sh` no longer opens 3000,
      matching the live firewall (80/443 Cloudflare-only, checked against the live rules)
- [x] GitGuardian "Generic Password" alerts on the e2e specs: the throwaway accounts' passwords
      are generated at runtime (`testPassword()` in `tests/fixtures.ts`); the alerts were test
      credentials only
- [x] Stale branches and worktrees removed; the `data_vis` exports were already deleted on
      `main` (`84f60a6`), though they remain in the public repo's history

## 2. Genre matching and taste profiles

- [ ] Add a genre alias layer and de-duplicate cluster leaves (KNOWN_ISSUES 18)
- [ ] Unify the four copies of the cluster matcher into `$lib` and wire the taste
      profile into the mobile API (KNOWN_ISSUES 22)
- [ ] Match the same artist across providers by more than name (KNOWN_ISSUES 19)
- [x] Fix `/api/spotify/artists` sharing its last result between users (KNOWN_ISSUES 23):
      the genres now travel in the caller's own `spotify-genres` cookie, and the endpoint's
      Spotify call goes through `spotifyApi()` so the e2e suite covers it (2026-11-09)

## 3. More ways to build a taste profile

- [ ] ListenBrainz import by username (public stats API, same shape as the Last.fm import)
- [ ] Upload a Spotify privacy data export (streaming history JSON), count artists and
      feed the profile; an upgrade path, not onboarding, since the export takes days
- [ ] Learn from in-app behaviour: interested events, check-ins (`api/mobile/checkin`),
      maybe a thumbs up/down after a night, nudging genre weights
- [ ] "Nights like these" genre picker that shows sample events or artists per cluster
      instead of bare cluster names
- [ ] Link each new importer from the onboarding cap note (`/onboarding` stops at 5 artists
      and points to the taste profile and the Last.fm import for more) and from `/users-home`

Ruled out: Spotify playlist link paste (development mode only returns playlists the user
owns), Deezer (new API access closed since 2025), Apple Music (paid developer account, no
top artists or play counts on the web).

## 4. Correctness and security (web app)

- [x] Keep Postgres `DATE` values as `YYYY-MM-DD` end to end and use the local day in the
      mobile API (KNOWN_ISSUES 17): `$lib/db` parses OID 1082 as text, the display sites read it
      with `fromLocalIsoDate`, and the three mobile "today" endpoints prefer a caller-supplied
      date over the server's local day. The app itself still sends no date (2026-11-09)
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

Superseded by section 1 once `barfindr` stops polling venue Spotify playback.

- [ ] Process venues in parallel chunks instead of one sequential loop
- [ ] Move 24-hour genre aggregation into SQL instead of loading rows into memory

See [`docs/analysis/barfindr-technical-analysis.md`](docs/analysis/barfindr-technical-analysis.md).

## 8. Housekeeping

- [ ] Replace colour classes outside the palette with real tokens (KNOWN_ISSUES 7)
- [ ] Swap `jsonwebtoken` for `jose` before the next Node upgrade (KNOWN_ISSUES 10)
- [ ] One documented convention for runtime vs build-time config (KNOWN_ISSUES 20)
- [ ] Bring `docs/analysis/` up to date with what has been fixed since January
