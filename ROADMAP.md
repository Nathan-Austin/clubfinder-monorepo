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
      those picks now feed matching too, so the polling is no longer the only source of a venue
      profile — but `barfindr` still polls, and venues cannot set bare genres without an artist)
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
- [x] Feed the venue artists (`bar_favourite_artists`) into `/barfindr` matching (2026-11-09):
      both matchers (`/barfindr` and `POST /api/mobile/bars/matching`) fold those artists' genres
      into the venue profile before clustering, so a venue that never connected Spotify can be
      matched on its own description of itself instead of scoring 0. `barfindr`'s polling still
      fills `bar_genre_profiles`; it is now one of two sources rather than the only one
- [ ] Nudge existing users with fewer than 3 favourite artists towards `/onboarding`; only new
      accounts are sent there
- [x] Mobile bar API leftovers (KNOWN_ISSUES 26, 27): `spotify-connect` and `stats` auth, and the
      missing event edit route. All three done (2026-11-09): the event route exists with `PUT`
      and `DELETE`, both remaining endpoints are behind `denyUnlessBarManager`, and `stats` also
      had to be repaired (unqualified tables, a `genre_matches` table that does not exist) since
      it had been answering 500 to everyone
- [x] Verify the reCAPTCHA on the server for `/register` (KNOWN_ISSUES 28), and for
      `/register/promoter`: a good token sets a short-lived encrypted cookie, registration
      requires and spends it; tests judge tokens against `tests/mock-recaptcha.ts` (2026-11-09)
- [x] Fix `app_clubfindr` type checking, add a test runner and make its CI able to fail
      (KNOWN_ISSUES 29, 2026-11-10): lint errors, `tsc`, Jest and the Android bundle build now
      fail CI, and so block the deploy. Still never run on a device or simulator

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

- [x] Add a genre alias layer and de-duplicate cluster leaves (KNOWN_ISSUES 18), done 2026-11-10:
      `$lib/data/genreAliases.ts` resolves spelling variants and umbrella terms before any fuzzy
      guessing, gives all 92 contested leaves one home, and sends genres with nowhere to go
      straight to Uncategorized instead of letting the fuzzy pass invent an answer. The fuzzy pass
      is typo tolerance only now (word by word, nothing under five characters), so `funk → punk`,
      `hip hop → trip hop`, `dnb → dub` and `country → Hip-Hop/Rap` are gone. Not yet run against
      the e2e suite
- [x] Add the clusters the tree had no home for at all (KNOWN_ISSUES 18), done 2026-11-10: Pop,
      "Soul, Funk and Disco", Jazz, "African Popular Music", Classical and
      "Folk and Singer-Songwriter" — 115 leaves across 20 sub-clusters, so pop, soul, funk, disco,
      jazz, afrobeats, classical, gospel, k-pop, schlager and folk resolve at full weight instead
      of being dropped. `r&b` moved out of Hip-Hop/Rap and in with soul. The pickers were
      regenerated with `pnpm convert-genres`
- [x] Fold the two overlapping rock trees into one (KNOWN_ISSUES 18), done 2026-11-10:
      "Alternative Rock and Punk" is gone and "Rock Music" is the one rock cluster, with a new
      "Gothic and Wave" sub-cluster for the goth and wave leaves it had no home for. An `emo` fan
      now matches a `post-hardcore` venue instead of scoring 0, and 36 of the 92 `CANONICAL_HOMES`
      entries were retired because they existed only to arbitrate between the two copies
- [x] Count how much of a genre each side actually plays towards its score (KNOWN_ISSUES 32),
      done 2026-11-10: `findWeightedClusters` scales every profile by its own strongest genre, the
      taste profile weighs genres by how many favourite artists carry them, an event's genres
      outweigh the venue's standing self-description (declared artists drop to 0.25 on a day with
      an event, stay 1 without one), and the rolling play counts are scaled to a unit maximum so
      the fixed weights mean something. Explicit genre picks stay unweighted. Not yet run against
      the e2e suite or on production data
- [x] Widen umbrella genres across their whole family (KNOWN_ISSUES 18), done 2026-11-10:
      `UMBRELLA_FAMILIES` names every sub-cluster an umbrella covers and scoring matches a family
      against any of its members, counting it in the denominator for what it matched rather than
      splitting its weight — so "house" reaches all four house sub-clusters and still scores 1 at
      a venue playing only one of them. Umbrellas now shadow same-named leaves (techno, jazz,
      pop, soul, classical) on purpose. The picker's own group names ("Minimal and Techno")
      resolve as genres again. Not yet verified against live API data
- [ ] Revisit the absolute similarity cut-off now that scores are weighted. `/clubs` keeps
      matches above 0.05 and `/barfindr` filters on the same figure, set when every exact match
      scored 1.0. Weighted profiles (artist counts, event vs self-description) spread a side's
      weight, so a broad profile against a venue with many genres can fall under it and vanish
      rather than rank low. Ranking is unaffected; only the cut-off measures something new
- [x] Unify the four copies of the cluster matcher into `$lib` and wire the taste
      profile into the mobile API (KNOWN_ISSUES 22), done 2026-11-10: one matcher in
      `$lib/server/genreMatching` (the `/clubs` one, the only weighted version), and the two
      mobile matching endpoints fall back to the caller's profile when it sends no genres
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
