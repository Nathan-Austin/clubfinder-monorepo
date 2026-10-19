# Known issues

Things found during the upgrade and deliberately left alone. None blocks the deploy.

## Behaviour

1. _Fixed._ Date fields used the UTC day (`toISOString().substring(0, 10)`): a search at
   00:30 Berlin time sent the previous day. `$lib/localDate` now formats and parses the local
   date parts everywhere a date is picked or shown (search forms, `/clubs` heading, bar event
   defaults, promoter event `min`).
2. **Spotify token refresh never stores the new expiry** (`spotify/search/+page.server.ts`):
   the refreshed expiry is computed but the `spotifyTokenExpiry` cookie is not updated, so
   every request refreshes again.
3. _Fixed._ `/clubs`, `/barfindr` and `/promoter-home` returned 500 when opened without the
   expected cookies (no city / not logged in); they now redirect to `/` and `/login/bars`.
   A city without a date also redirects (`/barfindr` used to fall back to the server's day).
4. **`/bars` without the Spotify flow has no `barId`**, so creating a bar event posts to
   `/api/bars//events` (404). The dashboard assumes Spotify has been connected.
5. _Partly fixed._ The rate limiter trusted `X-Forwarded-For` / `CF-Connecting-IP` as sent;
   it now keys on `event.getClientAddress()`, i.e. the header the deployment declares with
   `ADDRESS_HEADER`/`XFF_DEPTH` (see `.env.example`). Still per process memory (fine for the
   single PM2 instance), and requests without the trusted header share one bucket.
6. _Fixed._ Password reset e-mails hard-coded `https://www.clubfindr.com`; the link now uses
   the request origin (`ORIGIN` in production). Mail goes through `$lib/email`, configured
   by `SMTP_*` and `MAIL_TRANSPORT` at runtime (see `.env.example`).

## Code health

7. **Colour classes outside the palette** (`text-gray-700`, `bg-blue-500`, … 174 uses).
   They generate no Tailwind CSS; `app.css` themes through attribute selectors on the class
   names (`[class*='bg-gray-']`, `[class*='text-']`). Replacing that with real palette
   tokens is a design refactor; until then the names must stay.
8. **`.feature-icon` colour on the home page** was never applied (the old variable held an
   RGB triplet). Left as it renders; `color: rgb(var(--rgb-secondary))` would colour it.
9. **Legacy-syntax dependencies**: `date-picker-svelte` and `lucide-svelte` are Svelte 4
   style components (excluded from forced runes mode). Fine, but they will not move to
   Svelte 6 without updates.
10. **`jsonwebtoken` on Node 26** crashes (`buffer-equal-constant-time` needs the removed
    `SlowBuffer`); Node 24 is LTS until April 2028, so this only matters for the next Node
    bump (swap to `jose` or patch the dependency).
11. **`src/routes/api/spotify/artists/+page.svelte`** is a stub page living next to an API
    endpoint; `src/stores/genres.svelte.ts` is only read by it and never written.
12. **`hooks.server.ts` logs every non-asset request** and the login endpoint logs request
    shapes; noisy in `pm2 logs`.
13. **SvelteKit 3** is still prerelease (`3.0.0-next.*`); revisit when it ships.
14. **`svelte/no-navigation-without-resolve` and `svelte/prefer-svelte-reactivity`** are
    off in `eslint.config.js` (moot with an empty base path / false positives on local
    temporaries). Re-evaluate if either assumption changes.
15. **SMTP transport skips certificate verification** (`src/lib/email.ts`,
    `tls.rejectUnauthorized: false`): a man-in-the-middle on the SMTP connection would go
    unnoticed. Left as is for now because the mail host may present a certificate that does
    not match; flip it to `true` and test against the real host before removing.
16. **`/api/request-access` builds its own Gmail transport** (`smtp.gmail.com` with
    `GMAIL_USER`/`GMAIL_PASS`) instead of going through `$lib/email`, with the same
    `rejectUnauthorized: false`. It is the one endpoint that bypasses the configurable mail
    transport, so it still sends real mail in any environment that has the Gmail credentials.
17. **Postgres `DATE` columns pass through the server's timezone.** `src/lib/db.ts` sets no
    type parser, so node-pg turns `event_date` into a JS `Date` at server-local midnight;
    JSON then serialises it as the previous day's `T22:00Z`/`T23:00Z` (the server is in
    Germany). `BarEventModal.svelte` (`new Date(eventDetails.event_date).toISOString()`)
    saves the previous day when an existing bar event is edited, and the mobile API does the
    same with stored dates (`api/mobile/bars/matching`). The mobile API also still uses the
    UTC day for "today" (`api/mobile/events`, `api/mobile/bars/matching`,
    `api/mobile/bars/[barId]/stats`), outside the #1 fix. Likely fix:
    `types.setTypeParser(1082, (v) => v)` so `DATE` stays a `YYYY-MM-DD` string end to end,
    plus a client-supplied date for the mobile "today" cases.

## Taste profile follow-ups

From the taste profile work (`docs/HANDOVER.md` section 4, `docs/taste-profile-design.md`
section 4), left open on purpose.

18. **Raw genre tags the clusters do not know are dropped or misplaced.** `genreClusters.json`
    has no leaf for `house`, `hip hop`, `pop`, `nu disco`, `dnb`, `funk`, `soul`, `trance`,
    `rock`, `metal`, `edm`, `afrobeats` and others, and the fuzzy fallback makes false friends
    (`funk → punk`, `hip hop → trip hop`, `edm → idm`). Such tags end up `Uncategorized`
    (ignored in scoring) or in the wrong cluster, which limits how much a taste profile or a
    Last.fm import changes results. Proposed fix: an alias layer (`genre_aliases`, design doc
    section 2.2), plus de-duplicating the 92 leaves that sit in several sub-clusters.
19. **The same artist from two providers is only matched by name.** The Last.fm import reuses
    a `taste_artists` row with the same name from any source; a spelling difference gives two
    rows. Catalogue rows nobody favourites any more are never removed.
20. **Two ways of reading configuration.** Most of the app reads `.env` through
    `$env/static/*` at build time; mail (`MAIL_TRANSPORT`, `SMTP_*`), the taste settings
    (`LASTFM_API_KEY`, `LASTFM_API_BASE`, `SPOTIFY_API_BASE`, `SPOTIFY_ACCOUNTS_BASE`) and
    `SPOTIFY_CONNECT_ENABLED` use `$env/dynamic/private` at runtime, so tests can switch them
    without a rebuild and a missing optional key cannot break a build. Either document both
    conventions or move the optional keys to required placeholders.
21. **Spotify and Last.fm responses were never checked against the live APIs.** The mocks
    (`tests/mock-spotify.ts`, `tests/mock-lastfm.ts`) follow the public documentation: the
    development-mode 403 body, whether search and artist objects still carry `genres`, Last.fm
    error codes and HTTP statuses, the `toptags` count scale. `SPOTIFY_CONNECT_ENABLED=false`
    is unit-tested but not run end to end.
22. **Four copies of the cluster matcher** (`/clubs`, `/barfindr`, two mobile endpoints, three
    different normalisers). The profile is wired into the two web ones only; the mobile API
    does not read it. `src/lib/taste/genreClassifier.ts` imports `_findClusters` from the
    `/clubs` route module; move it into `$lib` when the matchers are unified.
23. **`/api/spotify/artists` shares its last result between users.** `lastFetchedGenres` is a
    module-level variable: GET returns the genres of whichever user's Spotify artists were
    fetched last, on the single PM2 process.
24. **Smaller gaps in the existing flows:** `/api/delete-user-data` does not clear
    `preferences` or `interested_events`; `user_sessions.genres` is wiped on every login and
    scoped to the home city; `/clubs` deletes the genre cookies on first read, so "Change
    Date" loses a guest's genres; "Change the vibe" restores the city but not the date; the
    `spotify_service` add_user call still runs when a Spotify e-mail is given at signup; mobile
    signup still requires a `musicService` choice.
25. **Seed dates move with the seed.** Only the four Berlin nights on 2031-06-21 are pinned;
    tests that need fixed results use `/clubs?date=2031-06-21`.
