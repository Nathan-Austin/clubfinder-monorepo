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
4. _Fixed._ **`/bars` without the Spotify flow had no `barId`**, so creating a bar event posted
   to `/api/bars//events` (404): the dashboard assumed Spotify had been connected. Every return
   of its `load` now carries `barId` (and `barName`), including the "not connected" and error
   paths, so events can be managed with no Spotify session at all. The dashboard also shows the
   artists a venue says it plays (`VenueArtistsSection`, the shared `ArtistPicker` against
   `/api/venues/:barId/taste`, stored in `bar_favourite_artists`), which is how a venue
   describes itself without connecting anything; with `SPOTIFY_CONNECT_ENABLED=false` the
   Spotify panels and the reconnect prompt are gone entirely. Those picks now also reach
   matching: both `/barfindr` and `POST /api/mobile/bars/matching` fold the venue artists'
   genres into its profile, so a venue with no `bar_genre_profiles` row is no longer scored 0
   and dropped (`listFavouriteGenresForOwners`, `tests/venue-taste.spec.ts`). Still open:
   `barfindr` continues to poll venue Spotify playback, a venue cannot declare bare genres
   without naming an artist, and `/login/bars` still retries the `spotify_service` add_bar call
   for venues that already have a Spotify e-mail.
5. _Partly fixed._ The rate limiter trusted `X-Forwarded-For` / `CF-Connecting-IP` as sent;
   it now keys on `event.getClientAddress()`, i.e. the header the deployment declares with
   `ADDRESS_HEADER`/`XFF_DEPTH` (see `.env.example`). Still per process memory (fine for the
   single PM2 instance), and requests without the trusted header share one bucket.
   Until 2026-11-09 production's `ADDRESS_HEADER` had a trailing `.`, so that was every
   request; fixed in the server's `.env`, and `hooks.server.ts` now logs once when the client
   address is missing. Node listens on 127.0.0.1 only, so every real request comes through
   nginx with Cloudflare's header; the deploy's local health check is the expected exception.
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
17. _Fixed._ **Postgres `DATE` columns passed through the server's timezone.** `src/lib/db.ts`
    set no type parser, so node-pg turned `event_date` into a JS `Date` at server-local
    midnight and JSON serialised it as the previous day's `T22:00Z`/`T23:00Z` (the server is in
    Germany). `BarEventModal.svelte` (`new Date(eventDetails.event_date).toISOString()`) then
    saved that previous day whenever an existing bar event was edited, moving it a day earlier
    on every edit, and the mobile API reported it (`api/mobile/bars/matching`).
    `$lib/db` now registers an identity parser for OID 1082 (`types.builtins.DATE`), so a
    calendar date stays the `YYYY-MM-DD` text Postgres sent, end to end. The two places that
    rebuilt it through `toISOString()` pass it through, and the places that render it parse it
    with `fromLocalIsoDate` ($lib/localDate) rather than `new Date('YYYY-MM-DD')`, which is UTC
    midnight and shows the day before west of UTC: `BarEventsSection`, `barfindr`,
    `promoter-home`, `users-home`. `promoter-home` also splits current from past events by
    comparing calendar dates, so an event stays current for the whole of its own day.
    The mobile API's "today" (`api/mobile/events`, `api/mobile/bars/matching`,
    `api/mobile/bars/[barId]/stats`) now prefers a caller-supplied `YYYY-MM-DD` — `stats` takes
    a new optional `?date=` — and otherwise uses the server's local day, not the UTC one.
    Covered by `src/lib/db.test.ts` and `tests/bars.spec.ts` ("editing an event keeps its
    date"). The mobile app still does not send its own date; until it does, a user far from the
    server's zone gets the server's day.

## Taste profile follow-ups

From the taste profile work (`docs/HANDOVER.md` section 4, `docs/taste-profile-design.md`
section 4), left open on purpose.

18. _Partly fixed 2026-11-10._ **Raw genre tags the clusters do not know are dropped or
    misplaced.** `genreClusters.json` has no leaf for `house`, `hip hop`, `pop`, `nu disco`,
    `dnb`, `funk`, `soul`, `trance`, `rock`, `metal`, `edm`, `afrobeats` and others, and the
    fuzzy fallback made false friends. The damage was worse than this item recorded: `country`
    resolved to Hip-Hop/Rap "Latin and Regional Variants", `dnb` to Reggae and Roots via `dub`,
    `classical` to Indie Pop "Chamber Pop", `blues` to "Folk and Fusion Punk" and `house` to
    "Ambient with Rhythmic Elements" — so the most common tags the providers return were
    confidently wrong rather than merely absent.

    `$lib/data/genreAliases.ts` is the alias layer (a module, not the `genre_aliases` table the
    design doc proposed; the data is hand-curated and belongs beside `genreClusters.json`). Four
    tables, applied by `$lib/server/genreMatching` before any fuzzy guessing, and validated
    against the cluster tree by `genreAliases.test.ts`:
    `GENRE_ALIASES` (spelling variants: `dnb`, `rnb`, `hip-hop`, `drum n bass`),
    `UMBRELLA_FAMILIES` (broad terms that name a family of sub-clusters: `house`, `rock`,
    `metal`, `trance`, `edm`, `reggae`, `blues`, `country`, `latin`, `indie`),
    `CANONICAL_HOMES` (all 92 contested leaves, so `deep house` no longer depends on JSON order
    and `reggaeton` files under Urban Latino rather than Reggae), and
    `UNSCORED_GENRES` (genres with no home at all, and tags too broad to mean anything).

    The fuzzy pass is now typo tolerance only: genres are compared word by word with hyphens as
    separators, word counts must agree, and a word under five characters is never fuzzy-matched.
    `techno`/`tekno` and `Hip-Hop/Rap`/`Hip Hop/Rap` still match; `funk`/`punk`, `hip hop`/`trip
hop`, `dnb`/`dub` and `edm`/`idm` no longer do. The fuzzy and word-boundary passes also take
    the best candidate instead of the first one the index happens to yield, so a near miss no
    longer depends on JSON order either.

    Three things are left open:
    - _Fixed 2026-11-10._ **Genres with no cluster at all**: `pop`, `soul`, `funk`, `disco`,
      `jazz`, `afrobeats`, `classical`, `k-pop`, `gospel` and `folk` had nowhere in the tree to go
      and resolved to Uncategorized, which scoring drops — so a user whose taste was mostly soul
      and funk got nothing out of matching. Six clusters now cover them: Pop, "Soul, Funk and
      Disco", Jazz, "African Popular Music", Classical and "Folk and Singer-Songwriter", 115
      leaves across 20 sub-clusters, and `UNSCORED_GENRES.noHome` is empty as a result.
      Two leaves moved out of an older home on purpose: `r&b`, which sat in Hip-Hop/Rap "Pop Rap
      and Melodic Rap" only because that was the one sub-cluster naming it, and `electropop`,
      which reads as mainstream pop more often than as the indie synth-pop of "Synth-Based Indie
      Pop". Six others collided and were left where they already were, since that was the better
      home: `pop rock`, `future pop` (futurepop is EBM, not pop), `jazz rap`, `contemporary
folk`, `folk pop` and `traditional folk`. The southern African styles stay in "Cultural
      House", where amapiano, gqom, kwaito and kuduro were already leaves.
      `static/lib/unified-genres.json` and `app_clubfindr/src/constants/unified-genres.json` were
      regenerated with `pnpm convert-genres`, so the pickers offer the new clusters too.
    - _Fixed 2026-11-10._ **Two overlapping rock trees.** "Rock Music" and "Alternative Rock and
      Punk" covered the same ground, so they split the rock audience in half: a leaf living in
      only one of them scored 0 against its counterpart in the other, and `emo` matched nothing
      at a `post-hardcore` venue. The alternative tree is folded into "Rock Music" now. Of its 90
      leaves, 36 were already there; 54 moved (punk into "Punk and Hardcore", emo into "Modern
      Hard and Heavy", grunge and lo-fi into "Alternative Rock", garage into "Contemporary Rock",
      no-wave into "Experimental and Post-Rock", and goth and wave into a new "Gothic and Wave",
      which rock had no home for at all); nine were dropped because another cluster was always
      the better home and the alternative tree was only ever a second copy — `bedroom pop` and
      `indie folk` (Indie Pop), `cowpunk` (Country), `industrial rock` (Industrial), `psych folk`,
      `psychedelic pop`, `space electronic` (Neo-Psychedelia), `gothic metal` (Heavy Metal) — and
      `anti-folk` went to Folk and Singer-Songwriter.
      This retired 36 of the 92 `CANONICAL_HOMES` entries outright: they existed only because the
      two clusters described the same music, and the table is the remaining 56. `goth` and
      `indie pop` became umbrella entries, since each names a cluster or a scene, not a leaf.
    - _Fixed 2026-11-10._ **Umbrella breadth.** An umbrella resolved to one sub-cluster, so
      `house` matched Classic House but not Modern, Cultural or Deep/Tech House — amapiano and
      tech house nights were invisible to a "house" user. `UMBRELLA_FAMILIES` now names every
      sub-cluster each umbrella covers, and scoring matches a family against any of its members:
      the family counts in the similarity denominator for what it actually matched, never less
      than its own weight, so naming "house" at a pure acid-house venue scores 1 rather than the
      ~0.14 that naive weight-splitting would have produced. An umbrella also takes precedence
      over a leaf of the same name ("techno", "jazz", "pop", "soul", "classical"), with the leaf
      kept as a fuzzy target and a test requiring the leaf's home to be a family member.
    - _Fixed 2026-11-10._ **The picker's own group names did not resolve.** The genre picker
      offers sub-cluster names as its second menu level and `/clubs` passes the pick straight to
      the matcher without expanding groups, so "Minimal and Techno" has to work as a genre. It
      did only through a fuzzy match onto the leaf "minimal techno", which tightening the fuzzy
      pass to real typos correctly stopped, after which `/clubs` answered "Sorry, we couldn't find
      any matches". Group names are indexed now, after the leaves and never over one, so a name
      that is also a leaf keeps the leaf's home. "Gothic and Wave" and "Mainstream Pop" had never
      worked at all. Found by the e2e suite, as was `genreWeights` leaking into the taste API's
      response (`toPublicProfile` strips it).

19. **The same artist from two providers is only matched by name.** The Last.fm import reuses
    a `taste_artists` row with the same name from any source; a spelling difference gives two
    rows. Catalogue rows nobody favourites any more are never removed.
20. **Two ways of reading configuration.** Most of the app reads `.env` through
    `$env/static/*` at build time; mail (`MAIL_TRANSPORT`, `SMTP_*`), the taste settings
    (`LASTFM_API_KEY`, `LASTFM_API_BASE`, `SPOTIFY_API_BASE`, `SPOTIFY_ACCOUNTS_BASE`) and
    `SPOTIFY_CONNECT_ENABLED` use `$env/dynamic/private` at runtime, so tests can switch them
    without a rebuild and a missing optional key cannot break a build. Either document both
    conventions or move the optional keys to required placeholders.
21. _Checked against the live APIs 2026-11-10; follow-ups open._ **Spotify, Last.fm and
    MusicBrainz responses had only been checked against the mocks** (`tests/mock-spotify.ts`,
    `tests/mock-lastfm.ts`, `tests/mock-musicbrainz.ts`), which follow the public docs.
    On 2026-11-10 the app's own client functions (`spotifyArtistLookup.ts`, `lastfm.ts`,
    `musicbrainz.ts`) were run by hand against the live services with production keys, from
    outside the repo. **Do not repeat this from tests or scripts in the repo, and never put API
    keys in any committed file**; the mocks are the test boundary. What it showed:
    - Matches the mocks: Spotify's token response, search and artist shapes, and its
      `{error: {status, message}}` 404 body; Last.fm `topartists` (`playcount` and `@attr.rank`
      as strings), the `toptags` 0-100 count scale, unknown user (HTTP 404, error 6) and
      invalid key (HTTP 403, error 10); the MusicBrainz search shape (`count`, `artists[]` by
      descending `score`, `tags[{count, name}]`) and its 403 without a User-Agent.
    - **Spotify `genres` is often empty**, on search results and artist lookups alike (Bicep
      and RÜFÜS DU SOL came back with `[]`, Fred again.. and Daft Punk with genres). The
      fallback below is the main path for many artists, not an edge case; in the live run
      Last.fm supplied Bicep's (`House` 100, `Disco` 95, `techno` 58).
    - **MusicBrainz answers 503 intermittently**, under load, whatever the User-Agent and well
      inside one request a second: one in two to one in four first calls in the run. The
      client gives up at once, and since genres are stored when an artist is added, one 503
      leaves that artist without MusicBrainz genres for good. Follow-up: retry a 503 once or
      twice after about a second.
    - **Last.fm reports an unknown artist as HTTP 200** with `{error: 6, message: "The artist
you supplied could not be found", links: []}`. The client classifies that as
      `unavailable` ("Last.fm is not answering"); the fallback still moves on to MusicBrainz,
      so the only harm is a misleading warning. Follow-up: treat error 6 on `artist.gettoptags`
      as "no tags".
    - **Last.fm artist images are a placeholder.** Every `user.gettopartists` image is the same
      grey star (hash `2a96cbd8b46e442fc41c2b86b821562f`; Last.fm stopped serving artist
      images in 2019), so imported artists get that as `imageUrl`. Follow-up: treat that hash
      as no image.
    - Smaller: Spotify images are now 640/320/160 wide, so `parseSpotifyArtist`'s preference for
      `width === 300` never hits and it takes the 640 one (320 would do); a bad client secret
      gets `400 {error, error_description}`, where the mock sends only `error`; MusicBrainz tag
      counts can be 0 or negative and arrive unsorted (`tagsToGenres` already filters and
      sorts, but the mock only has positive counts).
    - Not checked: Spotify's development-mode 403 for unregistered users, which needs a user
      OAuth login and stops mattering once `SPOTIFY_CONNECT_ENABLED=false`.
      Each follow-up should change the mock to the observed behaviour first, so the e2e suite
      shows the failure, then fix the client.
      An artist Spotify returns without `genres` no longer ends up with none: adding it falls
      back to Last.fm `artist.gettoptags` and then MusicBrainz tags
      (`src/lib/taste/genreFallback.ts`, wired into `POST /api/taste/artists`), so the profile
      survives Spotify dropping the field. The fallback runs only when an artist is added, and
      the result is stored in `taste_artists` like any other genres. MusicBrainz needs no key
      (`MUSICBRAINZ_ENABLED=false` switches it off) but does need a descriptive
      `MUSICBRAINZ_USER_AGENT` in production, and is held to one request a second.
      The full e2e suite now also runs with `SPOTIFY_CONNECT_ENABLED=false` (`dev/TESTING.md`),
      against the same mocks.
22. _Fixed._ **Four copies of the cluster matcher** (`/clubs`, `/barfindr`, two mobile
    endpoints, three different normalisers), and the profile was wired into the two web ones
    only. There is one matcher now, `$lib/server/genreMatching` (server-only: a genre no
    cluster knows is appended to `missing-genres.txt`), and `$lib/taste/genreClassifier` imports
    it instead of reaching into the `/clubs` route module. `/clubs` keeps its `_` re-exports so
    `src/lib/clubs-page-server.test.ts` still pins the behaviour; the version kept is the
    `/clubs` one, the only one that weighted its matches and the only one that kept unknown
    genres out of the score. Callers keep their own input preparation (`expandGenreGroups`,
    `expandCompoundGenres`, `combineGenreProfiles`), which is not matching.
    Two behaviour changes came with it, both for the three non-`/clubs` callers: they gained
    the weighted passes (exact 1.0, fuzzy 0.8, word-boundary 0.6) and lost a blanket rule in
    the mobile copies whereby any genre containing "house", "techno", "rock" or "metal" matched
    any cluster genre containing the same word, which collapsed those four families into
    whichever sub-cluster was found first. `matchingGenres` now echoes the genre as the matcher
    was given it, so after group expansion it is the cluster data's own spelling ("Reggaeton").
    The mobile matching endpoints now read the caller's taste profile when no genres are sent
    (`getProfileGenresForRequest`, by session cookie or the app's Bearer token), the precedence
    the web pages already used; `tests/mobile-taste.spec.ts` covers it.
    Note `src/lib/data/genre-classifier.ts` still has its own normaliser — that is the
    cosine-similarity classifier for the genre-maintenance script, not a matcher.
23. _Fixed._ **`/api/spotify/artists` shared its last result between users**: `lastFetchedGenres`
    was a module-level variable, so GET returned the genres of whichever user's Spotify artists
    were fetched last, on the single PM2 process. POST now stores them in the caller's own
    `spotify-genres` cookie and GET reads it back; `/selectedGenres` reads the cookie directly.
    The endpoint's Spotify call also goes through `spotifyApi()` now, so the e2e suite reaches
    it through the mock (`tests/taste.spec.ts`, "stay with their own visitor").
24. **Smaller gaps in the existing flows:** `/api/delete-user-data` does not clear
    `preferences` or `interested_events`; `user_sessions.genres` is wiped on every login and
    scoped to the home city; `/clubs` deletes the genre cookies on first read, so "Change
    Date" loses a guest's genres; "Change the vibe" restores the city but not the date.
    _Fixed behind `SPOTIFY_CONNECT_ENABLED=false`:_ the `spotify_service` add_user call at signup
    and the `musicService` choice in mobile signup. With the flag off, web and mobile signup
    for users and venues (`/login/users`, `/register`, `/api/mobile/signup`,
    `/api/mobile/bars/register`) ask for no music service or Spotify e-mail, store none and
    never call `spotify_service` (add_user / add_bar), even when an older client sends them;
    `GET /api/mobile/config` tells the app to hide the fields. With the flag on (still the
    default) nothing changes. Still open in this item: the `/api/delete-user-data`,
    `user_sessions.genres`, genre cookie and "Change the vibe" gaps. Venue login (`/login/bars`)
    no longer retries add_bar or sends a venue through Spotify with the flag off either.
25. **Seed dates move with the seed.** Only the four Berlin nights on 2031-06-21 are pinned;
    tests that need fixed results use `/clubs?date=2031-06-21`.

## Found during the section 1 work (November 2026)

26. _Fixed._ **The mobile bar API let anyone change any venue.** Every write under
    `/api/mobile/bars/[barId]` (create an event, edit the bar, create or delete a QR code,
    request a promotion) accepted any caller who knew the bar id. They now require that venue's
    session token or dashboard cookie (`$lib/server/barAuth`, `tests/mobile-bar-auth.spec.ts`);
    the reads customers use for discovery stay public. Fixed alongside: the session check had
    two copies with different rules (30-day sliding in `authUtils`, 7-day fixed in the venue
    taste code); there is one now, and `/api/mobile/bars/login` writes the session row before
    returning its token, so the app's first request can no longer be refused.
    The last two, held back at the time, are closed as well:
    `POST .../spotify-connect` (it let anyone overwrite a venue's stored Spotify tokens and read
    its Spotify e-mail back; the worry was that the caller might no longer hold a venue session
    by then, but `mobileSpotifyService` posts while the venue is logged in and the app sends its
    token on every request) and `GET .../stats`. The latter also never worked: its tables were
    not schema-qualified and it counted a `genre_matches` table that does not exist, so it
    answered 500 to everyone — which is why the app reads `/api/mobile/bars/stats`, the
    token-based route where that same count is commented out. Both are fixed.
    `GET /api/mobile/bars/[barId]/stats` now duplicates `/api/mobile/bars/stats`; it could be
    removed once nothing is known to call it.
27. _Fixed._ **Editing an event in the app failed.** `EventFormScreen` sends
    `PUT /api/mobile/bars/:barId/events/:eventId`, a route that did not exist (404), so only
    creating worked; `BarHomeScreen` stubbed out deletion ("until proper endpoint is
    available") for the same reason. The route exists now with `PUT` and `DELETE`, guarded like
    the other writes, answering in the shape the app already expects and treating another
    venue's event as a 404. The app also read the returned `event_date` with `new Date(...)`
    (UTC midnight) and wrote it back from the local parts, which would have saved the previous
    day west of UTC: `app_clubfindr/src/utils/localDate.ts` now parses it as a local day.
28. _Fixed._ **Venue registration checked the reCAPTCHA in the browser only.** `/register`
    called `/api/verify-captcha` to unlock the form, but `POST /register` (and
    `POST /register/promoter`) never verified anything, so a script could register venues by
    posting directly. reCAPTCHA tokens are single-use and expire within minutes while the form
    is being filled in, so `/api/verify-captcha` now marks a good token with a short-lived
    encrypted cookie (`$lib/server/captcha`), both registration endpoints refuse without it,
    and a successful registration spends it. In the e2e suite the token is judged by
    `tests/mock-recaptcha.ts` on :4178 via `RECAPTCHA_VERIFY_BASE` (unset in production);
    covered by `tests/register-captcha.spec.ts`.
29. _Fixed 2026-11-10, apart from device testing._ CI (`.github/workflows/app-clubfindr-ci.yml`)
    now fails on lint errors, `npm run typecheck`, `npm test` (Jest via `jest-expo`) and
    `npx expo export --platform android`, on Node 24 (`app_clubfindr/.nvmrc`); `expo-doctor`
    is report-only, since it flags Expo packages a patch behind the SDK. The `"*"` mapping is
    gone and the real errors fixed: QR sharing called `expo-file-system/next` APIs that do not
    exist (now `expo-file-system/legacy`), plus the `Main` route's params, a city
    `autoComplete` value and the unused `src/api/client.ts`. Nothing has run on a device yet.
    The original finding: **`app_clubfindr` type checking hid real errors.** Its `tsconfig.json` maps `"*"` to
    `node_modules/*`, which makes `react` resolve to its JavaScript with no types:
    `npx tsc --noEmit` reports about 175 errors, almost all of them that. With the mapping
    removed for a check, five real ones remain (`SearchScreen.tsx` twice,
    `QRCodeGeneratorScreen.tsx` twice, `EditBarProfileScreen.tsx`). The app also has no test
    runner, and its CI (`.github/workflows/app-clubfindr-ci.yml`) cannot fail: every step is
    `continue-on-error`, `npm run lint` and `npm test` name scripts that do not exist, and its
    Node 18 job is below what React Native 0.81 and Metro require (`>= 20.19.4`).
    `npx expo export --platform android` does build the bundle and would be a cheap first
    real check.
30. **`tests/rate-limit.spec.ts` was flaky once** ("entries a client prepends to
    X-Forwarded-For do not open new buckets" failed, then passed on retry). Not reproduced in
    any run since; watch for it. (A second flake, in `bars.spec.ts` with the flag off, had a
    real cause and is fixed: the dashboard tests waited for the Spotify dialog to know the page
    had hydrated, and with no dialog a click could land too early. `openBarDashboard` in
    `tests/fixtures.ts` now waits for the page properly.)
31. _Fixed._ **`/api/mobile/login` answered 500 for every user without a Spotify app.** It read
    `spotify_apps.rows[0].client_id` unconditionally; most users have no app (none at all with
    `SPOTIFY_CONNECT_ENABLED=false`), so it threw, and `LoginScreen` silently fell back to
    `/login/users` on every login. It also wrote the session row after answering, like the bar
    login (item 26). Covered by `tests/mobile-taste.spec.ts` now.
32. _Fixed 2026-11-10._ **Cluster matching ignored how much of a genre a venue plays.**
    `findClusters` was given only the genre _names_ of a profile (`Object.keys`), so one track of
    afrobeats counted for as much as a whole night of it, and the user side had no weights at
    all — `listFavouriteArtists` flattened the favourites' genres into a de-duplicated list, so
    three techno artists and one salsa artist read as equal parts techno and salsa.

    Both sides carry weights now. `findWeightedClusters` (`$lib/server/genreMatching`) takes a
    `genre → weight` profile and multiplies each entry's match weight (exact 1.0, fuzzy 0.8,
    word-boundary 0.6) by the genre's share of the profile's strongest weight — normalising by
    each side's own maximum keeps a year of play counts and three picked artists comparable, and
    keeps the score symmetric. Per cluster, entries sum and cap at 1, so a half-deep-house,
    half-tech-house profile is wholly a Deep/Tech House one. The user side weighs each genre by
    how many favourite artists carry it (`FavouriteArtistsProfile.genreWeights`), applied in all
    four matchers when the taste profile is the genre source; explicit picks (cookies, genres the
    app sends) stay unweighted, since naming a genre is asking for it.
    `expandWeightedProfile` carries the weights through the callers' genre expansions.

    The venue profile assembly changed with it, in `/barfindr` and
    `POST /api/mobile/bars/matching`: the rolling profile is scaled to a unit maximum before
    other sources are combined in (raw play counts drowned out any fixed weight); an event's
    genres carry full weight (1, was 0.5), since what is on tonight beats a standing
    description; and the venue's declared artists weigh 0.25 on a day the venue has an event
    with genres but 1 on a day without one — the old flat 1 was backwards for a
    what's-on-tonight product. `getTopGenres` ordering is unchanged in spirit; the weights it
    sorts by are now the same ones the score uses.

    This made the umbrella-breadth item of #18 possible, but **not by splitting an umbrella's
    weight across its family**. That was tried on a parallel branch on 2026-11-10 and measured:
    a "house" fan scored 0.14 at an acid-house, tech-house or amapiano night and 0.23 at one
    playing every kind of house, against 1.0 for the specific genre. What shipped is
    `UMBRELLA_FAMILIES` with family-aware scoring (#18): a family counts in the denominator for
    what it matched, never less than its own weight. Any change to umbrella scoring should keep
    those cases at 1.0 and "house" against salsa at 0.

33. **Real production secrets sit in env files in the working copy.** Besides the
    `clubfindr/.env` that `dev/setup.sh` writes (dev values only), the checkout holds
    `clubfindr/.env.bak`, `clubfindr/.env.pre-hardening`, `data_collection/.env` and
    `spotify_service/.env.local`, which contain live credentials (mail passwords, OpenAI and
    Grok keys, OAuth and JWT secrets). They are gitignored and, since 2026-11-10, readable only
    by their owner. Agents and scripts must not open, print, copy or summarise them, nor create
    new env files with real keys; the e2e suite needs nothing but `clubfindr/.env` and the mocks.
    Whether to keep the backups at all is the owner's call.
34. **`app_clubfindr/` contains a nested `.git`**, the app's history from before the monorepo.
    The monorepo tracks the app's files normally, but a git command run from inside
    `app_clubfindr/` uses the nested repository: `git status` there reports unrelated changes and
    a commit there lands in the wrong repo. Run git from the repository root (or with
    `git -C <root>`) until it is moved out, e.g. into `.git-backups/` with the other old histories.
35. **Ten Expo packages are a patch release behind SDK 54** (`npx expo install --check`, 2026-11-10):
    `expo` 54.0.32 → 54.0.37, `expo-auth-session`, `expo-constants`, `expo-crypto`,
    `expo-dev-client`, `expo-linking`, `expo-notifications`, `expo-router` 6.0.22 → 6.0.24,
    `expo-updates` 29.0.16 → 29.0.20 and `expo-web-browser`. This is why `expo-doctor` is
    report-only in CI. Upgrading them with `npx expo install --fix`, then making `expo-doctor`
    a failing step, needs the app's four CI checks to pass and ideally a device run.
