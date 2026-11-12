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
      both feed matching; left open until the Spotify paths above actually go — unblocked
      since 2026-11-12, when `SPOTIFY_CONNECT_ENABLED=false` went live in production)
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
      (picker done: `/api/venues/:barId/taste`, the bar dashboard and the app's bar dashboard,
      and those picks feed matching. **Polling retired 2026-11-12**: the `spotify_genre_polling`
      and `process_bar_batch` tasks, their beat entry and `barfindr`'s `spotify_service.py` are
      gone; the remaining aggregate and cleanup tasks drain `bar_genre_profiles` and
      `bar_genre_aggregates` within 24 hours of the deploy, after which a venue profile comes
      from its declared artists and its events. Still open: venues cannot set bare genres
      without naming an artist. `spotipy` stays in `requirements.txt` until the full
      `spotify_service` retirement so the deploy does not stop for a by-hand requirements step)
- [x] Run `SPOTIFY_CONNECT_ENABLED=false` end to end (KNOWN_ISSUES 21): the whole Playwright
      suite passes with the flag off and with it on, against the mocks, on a database rebuilt
      from `dev/schema.sql` with every migration applied, following CI's steps (2026-11-08).
      That includes `signup-journey.spec.ts`, which signs up, picks artists and checks the
      clubs those genres reach, with no streaming account at any step (`clubfindr/dev/TESTING.md`)
- [x] Verify Spotify, Last.fm and MusicBrainz responses against the **live** APIs
      (KNOWN_ISSUES 21), done by hand 2026-11-10 with production keys, outside the repo. The
      shapes match the mocks; the differences are listed in KNOWN_ISSUES 21. Not something to
      automate here: no live calls from tests or scripts, and no API keys in committed files
- [x] Act on the live-API findings (KNOWN_ISSUES 21), mock first so the e2e suite shows each
      one, then the client. Done 2026-11-11: MusicBrainz 503s are retried (up to three attempts,
      a second apart); Last.fm error 6 on `artist.gettoptags` reads as "no tags", not an outage
      (it was dropping the artist from an import); Last.fm's placeholder star image is treated as
      no image; Spotify's image choice is by width rather than an exact 300 (so 320 at today's
      sizes); and the remaining mocks are in line — the live image widths, `error_description` on
      token errors, MusicBrainz counts of 0 or below and unsorted, and empty Spotify `genres`
      documented as the common case

### Follow-ups from the section 1 work

Things to do by hand or decide, collected while building the items above.

- [x] Apply `clubfindr/migrations/20261108_add_bar_favourite_artists.sql` to production: applied
      by hand with the deploy of `0dc724f` (2026-11-09). From the next deploy on, `deploy/deploy.sh`
      applies new migrations itself and only stops for destructive or failing ones
- [x] Set `SPOTIFY_CONNECT_ENABLED=false` in the production `.env` (confirmed live 2026-11-12:
      `https://www.clubfindr.com/api/mobile/config` returns `{"spotifyConnectEnabled":false}`).
      This unblocks the section 1 items that were waiting on the Spotify paths actually going:
      retiring `spotify_service`, retiring the per-account and venue Spotify OAuth code, and
      stopping `barfindr`'s playback polling
- [x] Set `MUSICBRAINZ_USER_AGENT` in production, naming the deployment and a contact
      (confirmed 2026-11-12)
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

### Production status 2026-11-12 (confirmed by the owner; do not re-verify from here)

- [x] Commit `4048442` is deployed, with both 2026-11-11 migrations applied by hand:
      `20261111_clear_lastfm_placeholder_images.sql` and
      `20261111_finish_earlier_account_deletions.sql`. The deletion clean-up matched 0 rows —
      no stale "deleted" accounts existed in production, so nothing was ever exposed through
      social sign-in (KNOWN_ISSUES 24)
- [x] `RECAPTCHA_SECRET_KEY` is set in production and `POST /register` without a solved
      captcha answers 403 there (KNOWN_ISSUES 28). Gate live; a real solved-captcha
      registration has not been observed yet, so the success path is not fully verified
- [ ] `SMTP_TLS_VERIFY` is still not set in production (KNOWN_ISSUES 15); the mail host's
      certificate has not been checked against `SMTP_HOST`
- [ ] Owner's decisions still pending: the `data_vis` CSVs in git history, and the env
      backups holding production secrets (KNOWN_ISSUES 33)

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
      `hip hop → trip hop`, `dnb → dub` and `country → Hip-Hop/Rap` are gone. The e2e suite passes
      with it, in both `SPOTIFY_CONNECT_ENABLED` modes (2026-11-11)
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
      the fixed weights mean something. Explicit genre picks stay unweighted. The e2e suite passes
      with it, in both `SPOTIFY_CONNECT_ENABLED` modes (2026-11-11); not yet measured on
      production data, which is where a weighted profile's spread can still surprise us (see the
      similarity cut-off item below)
- [x] Widen umbrella genres across their whole family (KNOWN_ISSUES 18), done 2026-11-10:
      `UMBRELLA_FAMILIES` names every sub-cluster an umbrella covers and scoring matches a family
      against any of its members, counting it in the denominator for what it matched rather than
      splitting its weight — so "house" reaches all four house sub-clusters and still scores 1 at
      a venue playing only one of them. Umbrellas now shadow same-named leaves (techno, jazz,
      pop, soul, classical) on purpose. The picker's own group names ("Minimal and Techno")
      resolve as genres again. The e2e suite passes with it, in both `SPOTIFY_CONNECT_ENABLED`
      modes (2026-11-11), against the mocks; the genres real providers return for a given artist
      are a separate question, and only the 2026-11-10 live check speaks to that (KNOWN_ISSUES 21)
- [x] Revisit the absolute similarity cut-off now that scores are weighted, done 2026-11-11.
      Measured first: because the score's denominator is the union of both sides, one listener's
      best match of the seeded nights fell from 1.000 at three genres to 0.455 at ten, 0.182 at
      thirty-two and 0.133 at fifty, matching all the while on exactly the genres they had named,
      and a fifty-genre listener scores 0.095 against a two-genre line-up. The floor was
      measuring breadth, not disagreement: it cut a wide listener's afro-house match at 0.045
      while keeping weaker ones, and `api/mobile/events/matching`'s 0.1 (a third site, found
      while measuring) could discard such a listener's best match altogether. All three now keep
      anything above zero — the one case that is genuinely no match — through `MIN_SIMILARITY`
      and `isSimilarityMatch` in `$lib/server/genreMatching`, and `/clubs` loses its adaptive
      ladder. The result cap and the MMR diversity pass order what is shown. A relative band was
      measured and rejected: "within 20% of your own top match" returned exactly one result for
      every profile tried, and "at least 20% of it" kept everything non-zero
- [ ] Score a listener's taste in sides rather than as one profile ("you like this kind of
      thing, and here it matches really well"). Measured 2026-11-11 alongside the cut-off: for a
      32-genre listener, scoring each side of their taste separately lifts the indie night from
      0.091 to 1.000 (their rock side, 3 genres), the latin night from 0.136 to 0.667 and the
      disco night from 0.045 to 0.250, each one nameable in the UI. Two things are unsettled and
      want deciding before any code. **Granularity**: grouping by top-level cluster leaves
      "Electronic/Dance" holding 17 of the 32 genres, so an electronic-heavy listener gains
      little (0.182 to 0.400), while grouping by sub-cluster gives 22 sides for 32 genres and a
      one-genre side scoring 1.000 says little. **What not to do**: scoring a night against "the
      genres that matched it" is circular and returned 1.000 for nine of ten nights — a side has
      to be chosen from the listener's taste alone, before the night is seen
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
- [x] Route `/api/request-access` through `$lib/email` (KNOWN_ISSUES 16), done 2026-11-12. SMTP
      certificate verification (KNOWN_ISSUES 15) is switchable with `SMTP_TLS_VERIFY=true` but
      still off by default
- [ ] Turn on `SMTP_TLS_VERIFY` in production once mail is confirmed to work with it, then make it
      the default (KNOWN_ISSUES 15)
- [x] Require authentication on `POST /api/mobile/spotify/register` and stop it returning the
      Spotify client secret (KNOWN_ISSUES 42), done 2026-11-12: the caller's own session is
      required, a mismatched `userId` is refused, and the endpoint stores onto the caller's
      existing session instead of minting one
- [x] `/api/delete-user-data` should also clear preferences and interested events
      (KNOWN_ISSUES 24), done 2026-11-11 — and much more it had left behind, including every
      session and the Google and Facebook ids social sign-in would have used to reopen the
      account. One transaction, with the session cache evicted
- [x] Replace the eight `query('BEGIN')` … `query('COMMIT')` sequences with `withTransaction`
      (KNOWN_ISSUES 39), done 2026-11-12, with a source guard so the pattern cannot come back.
      Logout now evicts the session cache too (KNOWN_ISSUES 41)
- [ ] Store the refreshed Spotify token expiry (KNOWN_ISSUES 2), or drop the flow with section 1
- [ ] Input validation on all API endpoints and an audit of raw SQL
- [x] Reduce request logging in `hooks.server.ts` (KNOWN_ISSUES 12), done 2026-11-12

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

Closed 2026-11-12: section 1 superseded it — the venue Spotify playback polling was retired
outright, so there is nothing left to scale. (Both items had in fact already been done while
the polling lived: it dispatched venues in chunked Celery batches, and the 24-hour aggregation
ran in SQL.) `barfindr` now runs only the aggregate-refresh and cleanup tasks, which drain the
polled tables; retiring the component entirely belongs to the `spotify_service` retirement in
section 1.

See [`docs/analysis/barfindr-technical-analysis.md`](docs/analysis/barfindr-technical-analysis.md).

## 8. Housekeeping

- [ ] Replace colour classes outside the palette with real tokens (KNOWN_ISSUES 7)
- [ ] Swap `jsonwebtoken` for `jose` before the next Node upgrade (KNOWN_ISSUES 10)
- [ ] One documented convention for runtime vs build-time config (KNOWN_ISSUES 20)
- [ ] Bring `docs/analysis/` up to date with what has been fixed since January
- [ ] Move `app_clubfindr/.git` (the pre-monorepo history) out of the tree, e.g. into
      `.git-backups/`, so git commands run inside the app folder use the monorepo
      (KNOWN_ISSUES 34)
- [ ] Upgrade the ten Expo packages a patch behind SDK 54 and make `expo-doctor` a failing CI
      step (KNOWN_ISSUES 35)
- [ ] Owner's decision: the `data_vis` CSV exports were deleted from `main` (`84f60a6`) but are
      still in the public repo's history; removing them means rewriting history and a force push
- [ ] Owner's decision: keep or delete the env backups holding production secrets
      (KNOWN_ISSUES 33). Agents must not open them either way
