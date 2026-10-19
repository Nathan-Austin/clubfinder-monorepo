# Taste profile without Spotify: handover

What was built on top of the `baseline` commit, how to run and test it, what was decided,
what was deliberately left open, and what has **not** been verified against the real
services. The design and the trace of the original flows are in
[`taste-profile-design.md`](taste-profile-design.md); this document is the operational
summary.

## 1. What changed, in one page

Spotify keeps the app in development mode (a handful of allow-listed accounts), so taste can
no longer come from Spotify for most people. The work makes taste work without it:

| Area             | What exists now                                                                                                                                                                                               | Where                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Signup           | Spotify e-mail optional; `spotify_service` only called when one is given                                                                                                                                      | `src/routes/login/users/`                                                                                                           |
| Storage          | `taste_artists` (local catalogue: source, source_id, name, genres as the provider reported them, image) and `user_favourite_artists` (user ↔ artist, cascade on user delete)                                  | `migrations/20261017_add_taste_artists.sql`, `dev/schema.sql`                                                                       |
| API              | `GET/POST /api/taste/artists`, `DELETE /api/taste/artists/:id`, `GET /api/taste/search?q=`, `POST /api/taste/lastfm/import` (all logged-in only)                                                              | `src/routes/api/taste/`, logic in `src/lib/taste/`                                                                                  |
| Picker           | On `/` for logged-in users: artist search (catalogue + Spotify client-credentials search), add/remove favourites, the genre set, "Find clubs / bars with my taste"; linked from `/users-home`                 | `src/lib/components/TasteProfile.svelte`                                                                                            |
| Last.fm          | Import by username on `/users-home`: top artists → favourites, top tags → genres through the `/clubs` classifier                                                                                              | `src/lib/components/LastfmImport.svelte`, `src/lib/taste/lastfm.ts`                                                                 |
| Matching         | `/clubs` and `/barfindr` fall back to the profile's genres when no genres were picked for the search and the session has no Spotify genres; the `Uncategorized` fallback no longer matches itself on `/clubs` | one added block each in `src/routes/clubs/+page.server.ts`, `src/routes/barfindr/+page.server.ts`; `src/lib/taste/profileGenres.ts` |
| Spotify failures | 403 "user not registered" explained on `/`; `/spotify` loads its three sections independently and lists what failed; `?error=` is finally displayed on `/`                                                    | `src/lib/spotifyHosts.ts`, `src/lib/spotifyUtils.ts`, `src/routes/spotify/`                                                         |
| Flag             | `SPOTIFY_CONNECT_ENABLED` (default on) hides the users' connect buttons                                                                                                                                       | `src/lib/featureFlags.ts`                                                                                                           |
| Small fixes      | `/` remembers the city of the last search ("Change the vibe" no longer asks again)                                                                                                                            | `src/routes/+page.server.ts`, `+page.svelte`                                                                                        |
| Tests            | 122 unit tests (Vitest), 72 end-to-end tests (Playwright) with mock Spotify and mock Last.fm servers                                                                                                          | `src/**/*.test.ts`, `tests/`                                                                                                        |

The profile is a **plain set of genre strings** (the union of the favourite artists' genres);
the matchers classify those strings exactly as they classify Spotify's `artist.genres` today.

Precedence in `/clubs` and `/barfindr`, first non-empty wins:
`selected-genres` cookie → `genre` cookie → `spotify-genres` cookie → `user_sessions.genres`
(Spotify session) → **taste profile**.

## 2. Running and testing

Everything below is also in [`../dev/TESTING.md`](../dev/TESTING.md), which stays the
reference; this is the short version.

### Setup

Node 24 (`.nvmrc`), pnpm 10.34.6 (`packageManager`), Postgres 13+ (binaries or Docker).

```bash
pnpm install
dev/setup.sh          # Postgres on 127.0.0.1:54329, schema, seed, .env with placeholders
```

`setup.sh` reloads the seed every time but loads the schema only once. A database created
before this work needs `migrations/20261017_add_taste_artists.sql` (idempotent) or a reset:

```bash
PGPASSWORD=clubfindr_dev psql -h 127.0.0.1 -p 54329 -U clubfindr_dev -d clubfindr_dev \
  -v ON_ERROR_STOP=1 -f migrations/20261017_add_taste_artists.sql
```

### Checks

```bash
pnpm lint                 # Prettier + ESLint
pnpm check                # svelte-check, 0 errors 0 warnings
pnpm exec vitest run      # unit tests, no database or network
pnpm build
pnpm test                 # Playwright, builds, starts the app and the two mocks, runs offline
PW_SKIP_BUILD=1 pnpm test # reuse build/
pnpm exec playwright test tests/taste.spec.ts   # the taste, Last.fm and Spotify-connect tests
```

Run them one after another (`pnpm test` builds into `build/` itself). The e2e suite blocks
every browser request that does not go to the app, and the app's server-side Spotify and
Last.fm calls are sent to `tests/mock-spotify.ts` (:4175) and `tests/mock-lastfm.ts`
(:4176) through runtime environment variables that Playwright sets for the app.

### Test logins (seed, all invented)

| Role                                                     | E-mail                    | Password          | Log in at      |
| -------------------------------------------------------- | ------------------------- | ----------------- | -------------- |
| Regular user, Spotify-style `preferences`, no favourites | `listener@clubfindr.test` | `Listener#2026`   | `/login/users` |
| Regular user, **no Spotify**, three favourite artists    | `fan@clubfindr.test`      | `Fan#2026`        | `/login/users` |
| Regular user, no Spotify, **empty** taste profile        | `newcomer@clubfindr.test` | `Newcomer#2026`   | `/login/users` |
| Promoter                                                 | `promoter@clubfindr.test` | `Promoter#2026`   | `/login/bars`  |
| Bar manager                                              | `bar@clubfindr.test`      | `BarManager#2026` | `/login/bars`  |

Only `tests/taste.spec.ts` logs in as `fan` and `newcomer`: a login deletes the user's other
sessions, so API calls of two tests using the same user in parallel would get 401. That file
runs in order in one worker and resets the fan's favourites to the seed before and after
each test, so an interrupted run cannot break the next one.

### Seed facts the tests rely on

- `fan`'s favourites: Juno Paperplane (deep house, minimal), Kasimir Low (minimal techno,
  dub techno), Tamsin Okra (afro house, amapiano). Perihelion Choir is in the catalogue but
  nobody's favourite, so it can be added offline.
- Four Berlin club nights on the fixed date **2031-06-21** (`/clubs?date=2031-06-21`):
  the fan's profile reaches Velour and Glasshouse, the mock artist Basement Omnivore's
  genres reach Calor and Night Shift Rock. All other events are relative to the seed date.
- Mock Spotify artists: Perihelion Choir, Perihelion Drift, Velvet Meridian, Glass Anvil,
  Unlabelled Static (no genres), Basement Omnivore. OAuth codes: `mock-code-ok`,
  `mock-code-unregistered`, `mock-code-partial`.
- Mock Last.fm users: `fanatic`, `solo_listener`, `nobody_here` (unknown), `ratelimited`
  (error 29), `broken` (HTTP 500).

### Environment variables added (all read at runtime, none required)

| Variable                                    | Default                         | Purpose                                                         |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `LASTFM_API_KEY`                            | placeholder = off               | Last.fm import; with the placeholder the form says "not set up" |
| `LASTFM_API_BASE`                           | `https://ws.audioscrobbler.com` | test override                                                   |
| `SPOTIFY_API_BASE`, `SPOTIFY_ACCOUNTS_BASE` | real hosts                      | test override for every server-side Spotify call                |
| `SPOTIFY_CONNECT_ENABLED`                   | on                              | hide the users' Spotify connect buttons with `false`            |

**Production checklist:** run the migration; add `LASTFM_API_KEY` to the server's `.env`
(no rebuild needed); decide `SPOTIFY_CONNECT_ENABLED`; leave the `*_BASE` variables unset.

## 3. Decisions taken

Recorded in detail in `taste-profile-design.md` section 5. In short: logged-in users only;
Spotify client-credentials search as the v1 catalogue source with Last.fm added after;
`genreClusters.json` kept, alias layer deferred; explicit saves only (no learning from
searches); plain genre set, artists only (no tracks); both matchers wired with minimal
additions, unification deferred; favourites deleted with the user through the FK cascade;
unknown genres carry no information (excluded from both sides of the similarity); the saved
profile sits _after_ Spotify session genres; Last.fm defaults: 12 months, 30 artists, 5
genres per artist, tag count ≥ 10, artists without recognisable genres are still imported
(the UI says so).

## 4. Follow-ups

Ordered roughly by impact on whether a user's picks actually change results. Tracked as
`docs/KNOWN_ISSUES.md` #18 to #25. The UTC date issue mentioned in the original list is fixed
(KNOWN_ISSUES #1); the taste search uses `$lib/localDate` too.

1. **Alias layer for raw tags the clusters do not know.** The biggest lever left.
   `genreClusters.json` has no leaf for `house`, `hip hop`, `pop`, `disco` (only `disco
house`), `nu disco`, `italo disco`, `dnb`, `funk`, `soul`, `trance`, `rock`, `metal`,
   `edm`, `afrobeats`, … and the fuzzy fallback produces false friends (`funk → punk`,
   `hip hop → trip hop`, `edm → idm`, `classic rock → classic house`). Today such tags end
   up `Uncategorized` (ignored) or misplaced. Visible in the Last.fm import: Velvet
   Meridian's `nu disco` and `italo disco` are dropped, only `disco` survives. Proposal in
   the design doc (section 2.2, `genre_aliases`); it touches `/clubs` and `/barfindr`, so it
   was held back until the other branch touching those files is in. Same step: de-duplicate
   the 92 leaves that appear in several sub-clusters (first one wins today).
2. **Same artist from several providers is matched by name only.** The Last.fm import
   reuses a catalogue row with the same name from any provider, and the search collapses
   same-name hits; nothing links `spotify`/`lastfm` rows otherwise, and a spelling difference
   ("DJ Koze" vs "Dj Koze") still gives two rows. A proper identity (MusicBrainz id, or a
   curated `artist_links` table) would fix it. Catalogue rows nobody favourites any more are
   also never cleaned up.
3. **Runtime environment variables break the build-time convention.** The rest of the app
   reads `.env` through `$env/static/*` at build time and requires every key. The new
   settings (`LASTFM_API_KEY`, `*_BASE`, `SPOTIFY_CONNECT_ENABLED`) use
   `$env/dynamic/private` so a missing key cannot break a build and tests can override hosts
   without rebuilding. Either accept two conventions (document in the README) or move the
   optional ones to `.env.example` with required placeholders and go static.
4. **Last.fm and Spotify response and error shapes were not verified against the live
   APIs.** All tests run against `tests/mock-spotify.ts` and `tests/mock-lastfm.ts`, written
   from the public documentation, and the sandbox had no internet access. Before relying on
   the messages in production, check with real accounts:
   - Spotify, development-mode 403 for a non-allow-listed account: the exact body
     (`{"error":{"status":403,"message":"User not registered in the Developer Dashboard"}}`
     is assumed; `describeSpotifyFailure()` matches loosely on "not registered",
     "development mode" and "developer dashboard"). Also whether the token exchange itself
     succeeds for such accounts, which the flow assumes.
   - Spotify artist objects from `/v1/search` and `/v1/artists/{id}` still carrying
     `genres` (reported to be sparse since 2024/25); an artist with none adds nothing to the
     profile.
   - Last.fm: error 6 for an unknown user (HTTP 404 assumed), error 29 for rate limits (HTTP
     429 assumed), errors 10/26 for a bad key, errors delivered with HTTP 200, the `toptags`
     count scale (0–100 relative assumed, `MIN_TAG_COUNT = 10`), the `image` array shape,
     and that `user.gettopartists` respects `limit` and `period` as used.
   - The e2e "flag off" state (`SPOTIFY_CONNECT_ENABLED=false`) is unit-tested (parsing) but
     not run end to end; the suite runs the app once, with the flag unset.
5. **Matcher unification.** Four copies of the cluster matcher (`/clubs`, `/barfindr`,
   two mobile endpoints) with three different normalisers; the profile was wired into the
   two web ones. The Last.fm classifier hook imports `_findClusters` from the `/clubs` route
   module (`src/lib/taste/genreClassifier.ts`); move `findClusters` into `$lib` when the
   matchers are unified. Mobile does not read the profile (out of scope by decision).
6. **Known gaps left as they were** (see `taste-profile-design.md` section 4): `/api/delete-
user-data` does not clear `preferences`/`interested_events`; `user_sessions.genres` is
   wiped on every login and scoped to the home city; `lastFetchedGenres` in
   `/api/spotify/artists` is shared by all users; `/clubs` deletes the genre cookies on
   first read so "Change Date" loses a guest's genres; the
   `spotify_service` add_user call still runs when a Spotify e-mail is given at signup;
   mobile signup still requires a `musicService` choice; "Change the vibe" restores the
   city but not the date.
7. **Seed date coupling.** Every relative event moves with the seed date; only the four
   pinned nights are stable. Tests that need fixed expectations should use
   `/clubs?date=2031-06-21`, or more pinned rows should be added.

## 5. Notes for rebasing the other branch

`src/routes/clubs/+page.server.ts` has three additive hunks (the `UNCATEGORIZED_CLUSTER_ID`
constant with two `continue`s in `calculateClusterSimilarity`, one import, and the
fifth-priority block before "If no genres were found from any source").
`src/routes/barfindr/+page.server.ts` has one import and the same fifth-priority block. No
lines were removed or moved in either file. `src/lib/clubs-page-server.test.ts` replaced the
test that pinned the old `Uncategorized` behaviour with two tests for the new one.

## 6. Commit map

`git log --oneline aceb542..HEAD` lists one commit per part, in this order: design doc →
optional Spotify e-mail → schema → endpoints → unit tests → seed → e2e → test isolation →
artist search → picker → mock Spotify + e2e → matching (Uncategorized fix, profile fallback,
taste search) → pinned date → city fix → Last.fm (library, form, mock + e2e) → Spotify
graceful failure → connect flag → Spotify connect e2e → this document.
