# Known issues

Things found during the upgrade and deliberately left alone. None blocks the deploy.

## Behaviour

1. _Fixed._ Date fields used the UTC day (`toISOString().substring(0, 10)`): a search at
   00:30 Berlin time sent the previous day. `$lib/localDate` now formats and parses the local
   date parts everywhere a date is picked or shown (search forms, `/clubs` heading, bar event
   defaults, promoter event `min`).
2. _Gone 2026-11-13._ **Spotify token refresh never stored the new expiry**
   (`spotify/search/+page.server.ts`). The guest search now uses the server-side app's token,
   cached in the process (`$lib/taste/spotifyArtistLookup`), with no token cookie at all, and the
   per-user refresh code is deleted with Spotify connect (ROADMAP section 1).
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
   and dropped (`listFavouriteGenresForOwners`, `tests/venue-taste.spec.ts`). `barfindr`'s
   venue Spotify playback polling was retired on 2026-11-12 (ROADMAP section 1), so the
   declared artists and the venue's events are the sources of a venue profile; the rolling
   `bar_genre_profiles` data drains within 24 hours of that deploy. Also since 2026-11-12 a
   venue can declare bare genres with no artist behind them (`bars.declared_genres`,
   `GET`/`PUT /api/venues/:barId/taste/genres`, the "Genres you play" dashboard section,
   `$lib/taste/venueGenres`): only genres the cluster matcher knows are accepted, and both
   matchers fold them in at the same weight as the venue artists' genres
   (`tests/venue-taste.spec.ts`, "declared venue genres"). The last loose end, `/login/bars`
   retrying `spotify_service` add_bar, went with venue Spotify connect on 2026-11-13: the
   dashboard has no Spotify panels or reconnect dialog at all now.
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
11. _Fixed 2026-11-13._ **`src/routes/api/spotify/artists/+page.svelte`** was a stub page next to
    an API endpoint, and `src/stores/genres.svelte.ts` was only read by it; both are deleted.
12. _Fixed 2026-11-12._ **`hooks.server.ts` logs every non-asset request** and the login endpoint
    logs request shapes; noisy in `pm2 logs`. The per-request line, both login endpoints' banners,
    request-shape dumps and timings are gone; every warning and error stays.
13. **SvelteKit 3** is still prerelease (`3.0.0-next.*`); revisit when it ships.
14. **`svelte/no-navigation-without-resolve` and `svelte/prefer-svelte-reactivity`** are
    off in `eslint.config.js` (moot with an empty base path / false positives on local
    temporaries). Re-evaluate if either assumption changes.
15. _Switchable 2026-11-12, still off._ **SMTP transport skips certificate verification**
    (`src/lib/email.ts`, `tls.rejectUnauthorized: false`): a man-in-the-middle on the SMTP
    connection would go unnoticed. Left off because the mail host may present a certificate that
    does not match. `SMTP_TLS_VERIFY=true` now turns verification on without a code change (only an
    explicit `true` counts); set it in production once mail is confirmed to work with it, then
    make it the default. As of 2026-11-12 it is not set in production and the mail host's
    certificate has not been checked against `SMTP_HOST`.
16. _Fixed 2026-11-12._ **`/api/request-access` builds its own Gmail transport** (`smtp.gmail.com`
    with `GMAIL_USER`/`GMAIL_PASS`) instead of going through `$lib/email`, with the same
    `rejectUnauthorized: false`. It is the one endpoint that bypasses the configurable mail
    transport, so it still sends real mail in any environment that has the Gmail credentials.
    Confirmed worse than recorded: from the e2e suite it opened a live SMTP connection to
    smtp.gmail.com (refused, with the placeholder credentials `dev/setup.sh` copies). It calls
    `sendEmail` now, and `GMAIL_USER`/`GMAIL_PASS` have left `.env.example`.
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
    (`LASTFM_API_KEY`, `LASTFM_API_BASE`, `SPOTIFY_API_BASE`, `SPOTIFY_ACCOUNTS_BASE`) and the
    MusicBrainz switches use `$env/dynamic/private` at runtime, so tests can switch them
    without a rebuild and a missing optional key cannot break a build. Either document both
    conventions or move the optional keys to required placeholders.
21. _Checked against the live APIs 2026-11-10; follow-ups done 2026-11-11._ **Spotify, Last.fm and
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
    - _Fixed 2026-11-11._ **MusicBrainz answers 503 intermittently**, under load, whatever the
      User-Agent and well inside one request a second: one in two to one in four first calls in
      the run. The client gave up at once, and since genres are stored when an artist is added
      and reused for 30 days, one 503 left that artist without MusicBrainz genres for good.
      `fetchMusicbrainzTags` now makes up to `MUSICBRAINZ_MAX_ATTEMPTS` (3) attempts, retrying
      only a 503 — a 400, a 404 or an unreachable host would answer the same way again — and the
      waits come from the existing rate limiter, so a retry is about a second later and the
      one-request-a-second budget still holds. `tests/mock-musicbrainz.ts` answers 503 twice for
      "Faint Transmission" before answering properly, which is what makes the retry visible to
      the e2e suite (`tests/genre-fallback.spec.ts`).
    - _Fixed 2026-11-11._ **Last.fm reports an unknown artist as HTTP 200**, with error 6 and
      the message "The artist you supplied could not be found". The client classified
      that as `unavailable` ("Last.fm is not answering"). The harm was worse than this item
      recorded: the genre fallback did move on to MusicBrainz with only a misleading warning, but
      the **Last.fm import dropped the artist altogether** — `importLastfmUser` counts a tag
      failure as `tags unavailable` and skips it, so an artist in someone's top artists that
      Last.fm has no tags for never became a favourite. Error 6 without a username is now its own
      `unknown-artist` code and `fetchTopTags` returns no tags for it, so the artist is imported
      with no genres instead. The mock answers error 6 with HTTP 200, as the live API does.
    - _Fixed 2026-11-11._ **Last.fm artist images are a placeholder.** Every
      `user.gettopartists` image is the same grey star (hash
      `2a96cbd8b46e442fc41c2b86b821562f`; Last.fm stopped serving artist images in 2019), so
      imported artists all got that as `imageUrl`. `pickImage` now skips any image whose URL
      carries that hash (matched by hash, since the URL differs by size), leaving `imageUrl`
      null unless a real picture is offered. Existing rows carrying the star were cleared by
      `migrations/20261111_clear_lastfm_placeholder_images.sql`, applied in production with the
      deploy of `4048442` (2026-11-12).
    - _Fixed 2026-11-11._ Smaller points, all four closed. Spotify images are 640/320/160 wide,
      so `parseSpotifyArtist`'s preference for `width === 300` never hit and every artist got the
      640 one; it now takes the smallest image at least `MIN_ARTIST_IMAGE_WIDTH` (300) wide, so
      320 at today's sizes, falling back to the largest when all are smaller and to document
      order when an image carries no width — a threshold rather than another fixed size, since
      Spotify has changed these before. `tests/mock-spotify.ts` serves one artist at the live
      widths, sends `error_description` with `invalid_client`, and says in writing that empty
      `genres` is the common case; `tests/mock-musicbrainz.ts` now sends tag counts of 0 and -1,
      out of count order, which `tagsToGenres` filters and sorts as it always claimed to.
    - Not checked, and moot since per-user Spotify login was removed (2026-11-13): Spotify's
      development-mode 403 for unregistered users.
      Each follow-up should change the mock to the observed behaviour first, so the e2e suite
      shows the failure, then fix the client.
      An artist Spotify returns without `genres` no longer ends up with none: adding it falls
      back to Last.fm `artist.gettoptags` and then MusicBrainz tags
      (`src/lib/taste/genreFallback.ts`, wired into `POST /api/taste/artists`), so the profile
      survives Spotify dropping the field. The fallback runs only when an artist is added, and
      the result is stored in `taste_artists` like any other genres. MusicBrainz needs no key
      (`MUSICBRAINZ_ENABLED=false` switches it off) but does need a descriptive
      `MUSICBRAINZ_USER_AGENT`, and is held to one request a second. Production has it set
      since 2026-11-12, naming the deployment and a contact.
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
24. **Smaller gaps in the existing flows:** _(fixed 2026-11-11 and 2026-11-12, see the end of
    this item)_ `/api/delete-user-data` does not clear `preferences` or `interested_events`;
    `user_sessions.genres` is wiped on every login and
    scoped to the home city; `/clubs` deletes the genre cookies on first read, so "Change
    Date" loses a guest's genres; "Change the vibe" restores the city but not the date.
    _Fixed 2026-11-12: the genre-cookie and date gaps._ `/clubs` and `/barfindr` read the
    genre cookies without deleting them (deleting "after reading" spent a guest's genres on
    one page view — a reload, a "Change Date" or a hop to the other page showed everything,
    unfiltered; the cookies expire on their own and every new search overwrites them, so an
    explicit pick now simply wins until it lapses — a day for `selected-genres`, an hour for
    the search cookies). "Change Date" also refreshes the `date` cookie, so the new date
    reaches the other page and the home page; and the home page starts from the remembered
    date like it already did the city, unless it is in the past (`tests/search.spec.ts`).
    Note the home DatePicker clamps to its own range, so a far-future date set through
    `?date=` shows clamped there.
    _Decided 2026-11-12, not a fix: the `user_sessions.genres` wipe on login stays._ The
    KNOWN_ISSUES 37 login rewrite deliberately resets `genres` as a column a new session must
    not inherit; the column is per-login scratch state for the streaming-analysis flows
    (`/api/analyze-selections`, mobile Spotify genres), which are dormant in production with
    `SPOTIFY_CONNECT_ENABLED=false` and write the durable copy to `users.preferences` anyway.
    The lasting profile is the taste profile, which `/clubs` and the matchers already use.
    The city scoping (`user_city = $2`) stays with it, for the same reason.
    _Removed outright 2026-11-13_ (ROADMAP section 1; before that, behind
    `SPOTIFY_CONNECT_ENABLED=false`): the `spotify_service` add_user call at signup
    and the `musicService` choice in mobile signup. With the flag off, web and mobile signup
    for users and venues (`/login/users`, `/register`, `/api/mobile/signup`,
    `/api/mobile/bars/register`) ask for no music service or Spotify e-mail, store none and
    never call `spotify_service` (add_user / add_bar), even when an older client sends them;
    `GET /api/mobile/config` tells the app to hide the fields. The flag and the code behind it
    are gone now; the config answers `false` as a constant for older app builds.
    The genre-cookie and "Change the vibe" gaps are fixed and the `user_sessions.genres` wipe
    is deliberate (both 2026-11-12, see the top of this item), so nothing here is open any
    more. Venue login (`/login/bars`) no longer retries add_bar or sends a
    venue through Spotify with the flag off either.
    _Fixed 2026-11-11: `/api/delete-user-data`._ It left far more than the two columns named
    above. Besides `preferences` and `interested_events` it kept the city, the Spotify app name,
    the unspent confirmation code, the taste profile (`user_favourite_artists`), outstanding
    password resets and **every session**, so the browser that asked for deletion stayed logged
    in — and through the session cache in `hooks.server.ts`, which holds the name and e-mail, a
    replayed session id kept reaching `/update-info` for up to five minutes. Worst, it kept
    `google_id` and `facebook_id`, which social sign-in looks the account up by, so the next
    "Continue with Google" would have walked straight back into the deleted account. All of it
    goes now, in one transaction (`withTransaction` in `$lib/db`), with the cached sessions
    evicted after the commit (`$lib/server/sessionCache`) and the cookies cleared;
    `tests/delete-user-data.spec.ts` checks the outcome in the database through `tests/db.ts`.
    Left in place on purpose: `user_checkins` (venue statistics count them and `user_id` is
    NOT NULL; with the account anonymised they no longer identify anyone) and any bar the user
    manages. `city` is emptied rather than cleared, being NOT NULL.
    `migrations/20261111_finish_earlier_account_deletions.sql` was applied in production with
    the deploy of `4048442` (2026-11-12) and matched 0 rows: no stale "deleted" accounts
    existed there, so nothing was ever exposed through social sign-in.
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
    Until 2026-11-13 this guard could be bypassed with a forged plain `barId` cookie (KNOWN_ISSUES
    52); it now accepts only a real venue session.
    `GET /api/mobile/bars/[barId]/stats` now duplicates `/api/mobile/bars/stats`; it could be
    removed once nothing is known to call it. `spotify-connect` itself was deleted with venue
    Spotify connect (2026-11-13).
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
    covered by `tests/register-captcha.spec.ts`. In production, `RECAPTCHA_SECRET_KEY` is set
    and `POST /register` without a solved captcha answers 403 (confirmed 2026-11-12) — the
    gate is live, but a real solved-captcha registration has not been observed yet, so the
    success path is not fully verified.
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
30. **`tests/rate-limit.spec.ts` was flaky once** (and `pages.spec.ts` "robots.txt is served" once,
    on 2026-11-13: "socket hang up" from a kept-alive connection; 3 of 3 reruns passed). Note
    `--repeat-each` cannot be used on the rate-limit tests: repeats inside a minute exhaust their
    shared bucket and answer 429 ("entries a client prepends to
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
    `clubfindr/.env.bak`, `clubfindr/.env.pre-hardening` and `data_collection/.env` (the
    `spotify_service/.env.local` copy was deleted with that component on 2026-11-14), which contain
    live credentials (mail passwords, OpenAI and
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
    `expo-auth-session` has had no user in `src/` since the Spotify connect removal (2026-11-13);
    take it out in the same upgrade.
36. _Mitigated 2026-11-11._ **Two checkouts running e2e at once broke each other's runs.** Every
    checkout and worktree on a machine shares the dev database (`clubfindr_dev` on 54329) and
    ports 4173-4178, whether Postgres is the one Docker container (`clubfindr-dev-postgres`, the
    case on the dev machine) or a worktree's private `dev/.pgdata` cluster, which the next
    worktree's `dev/setup.sh` finds already on 54329 and reuses. Either way `dev/setup.sh` reseeds
    the one database, wiping the data under a run already in progress from another checkout.
    Two runs at once can also exhaust the machine's memory (each is
    a production build, the servers and Chromium). Separate ports per worktree would fix the
    data but not the memory, so runs are serialised instead: `dev/e2e-lock.sh` keeps a lease,
    held across the several commands of a run, in the git directory the worktrees share, and
    `dev/setup.sh` refuses to reseed or stop the server while another checkout holds it
    (`dev/TESTING.md`, "One e2e run at a time"). A refused `run` exits 75 rather than waiting, so a
    session with other work can get on with it; `run --wait` blocks for the lease instead, which
    is what to use when the suite is all that is left. Still open: a bare `pnpm test` is not
    guarded, so it relies on the convention of calling it through `dev/e2e-lock.sh run`.

37. _Fixed 2026-11-11._ **Two logins by the same user at the same moment made one of them
    fail.** `user_sessions.user_id` is UNIQUE and both `/login/users` and
    `POST /api/mobile/login` replaced the session row with a `DELETE` followed by an `INSERT`.
    The two statements are not atomic, so two logins by one account at once — two devices, or a
    double submit — raced, and whichever `INSERT` lost violated the constraint and answered 500
    to a perfectly valid login. Both are one `INSERT ... ON CONFLICT (user_id) DO UPDATE` now,
    resetting the columns a new session must not inherit (`genres`, the Spotify tokens,
    `spotify_app_id`, `created_at`), which is what the `DELETE` used to take care of. Found by
    the e2e suite: `tests/timezone.spec.ts` logs in as the same seeded user from two parallel
    tests, which failed once in a run on 2026-11-11 and was reproduced deterministically by
    `tests/auth.spec.ts`, "two logins at the same moment both succeed".

38. _Fixed 2026-11-11._ **`UK Garage` was filed under "Cultural House"**, alongside Afro House,
    Amapiano, Gqom, Kwaito and Kuduro, so a UK garage night matched an amapiano fan at full
    weight and the other way round. It is with "Dubstep and Bass" now, which already held Future
    Garage and Grime: amapiano against a UK garage night goes 0.333 to 0, dubstep against it
    0.333 to 0.500, and the `garage` and `ukg` aliases follow. Found while measuring the
    similarity cut-off. Still open: the rest of the garage family is spread about — Speed Garage,
    4x4 Garage, Bassline House and UK Funky sit in "Footwork/Juke" — so a speed-garage fan and a
    UK-garage fan still score 0 against each other.

39. _Fixed 2026-11-12._ **`query('BEGIN')` … `query('COMMIT')` is not a transaction.** `$lib/db`'s `query()` takes a
    connection from the pool, runs one statement and releases it, so `BEGIN` goes back to the
    pool still open and the statements after it run on whichever connection is free. Eight
    places do this: `api/send-delete-confirmation-code`, `api/mobile/spotify/register`,
    `api/mobile/bars/register`, `promoter-home/events` and `promoter-home/events/[eventId]`,
    `register/promoter`, `register` and `spotify/login`. It has not visibly broken because the
    pool hands back the connection it was just given, so in quiet traffic the statements happen
    to share one; under concurrency another request can take that connection mid-sequence, and
    any error between `BEGIN` and `COMMIT` leaves a connection "idle in transaction" for an
    unrelated request to inherit, its writes then never committed. Demonstrated against the dev
    database on 2026-11-11. All eight are off it: multi-statement writes use `withTransaction`,
    single statements dropped the wrapper, and `spotify/login` no longer holds a transaction across
    its two Spotify HTTP calls. Two more leaks turned up on the way: an early "User not found"
    return between `BEGIN` and `COMMIT`, and catch blocks that sent `ROLLBACK` down a random pooled
    connection on every exit, successful Spotify logins included. Guarded in source by
    `src/lib/server/no-pooled-transactions.test.ts`; `tests/transactions.spec.ts` shows the stranded
    transaction from Postgres's side when run alone (in the full suite other traffic can absorb the
    leak, which is also how it hid in production).
40. _Fixed 2026-11-14 (`c474b5c`)._ **`App.Locals.user.id` was typed `number`**, but `users.id` is
    a uuid, so every `locals.user.id` was a string at runtime. It is typed `string` now, with the
    `role` the hooks already set; the session cache's type follows. The one reader,
    `/update-info`, passes it as a query parameter and needed no change.
41. _Fixed 2026-11-12._ **Logout does not evict the session cache.** `/logout` deleted the session
    row and the cookies, but not the `hooks.server.ts` cache entry, so a copy of the session id kept
    working for up to five minutes. It calls `evictSessions` now (`tests/auth.spec.ts`).
42. _Fixed 2026-11-12._ **`POST /api/mobile/spotify/register` had no authentication.** Given any
    user id, it created a session for that user and returned its token, and returned the user's
    Spotify app client id and secret, so anyone who learned a user's id could log in as them. The
    app calls it (`mobileSpotifyService`) during Spotify connect. It now requires the caller's own
    session — the app's Bearer token or the web session cookie, through `getSessionUserId` like
    the taste endpoints — answers 401 without one and 403 for a mismatched `userId`, and no longer
    returns the client secret (the app takes its OAuth credentials from the login response and
    `storeClientCredentials` ignores an empty secret, so nothing in the app loses them). It also
    stopped minting sessions: the caller already holds the user's one session
    (`user_sessions.user_id` is UNIQUE), so the Spotify tokens are stored on that row and the
    caller's own token is echoed back, where rotating the session id would have logged the same
    user's other surface out. Covered by `tests/mobile-spotify-register.spec.ts` and the reworked
    registration test in `tests/transactions.spec.ts`.
43. _Fixed 2026-11-12, still without a caller._ **`/promoter-home/events/[eventId]` could not
    work.** `PATCH` and `DELETE` used unqualified `events` (the search path is `"$user", public`;
    the table is `clubfindr.events`) and an `event_genres` table that does not exist (genres are an
    array column on `events`), so both answered 500 to everyone. Repaired rather than deleted, from
    the parallel branch: tables qualified, genres folded into the one `UPDATE`, so each handler is a
    single statement with ownership in its `WHERE` (no transaction, no check-then-act window);
    another promoter's event answers 404, not 403; the 401 for a missing `promoterId` cookie is no
    longer swallowed into a 500. Its SQL was checked against `dev/schema.sql` by hand. Nothing in
    the web app or the mobile app calls it and no test drives it; delete it if promoters are never
    meant to edit events this way.
44. _Fixed 2026-11-12._ **`/barfindr` only ever scored the first 50 venues of a city by name.** The
    candidate query ended `ORDER BY name LIMIT 50`, before any scoring, so in a city with more than
    50 venues one whose name sorted late could never be shown however well it matched. Every venue
    is scored now and the cap (100, as on `/clubs`) applies to the ranked results;
    `tests/barfindr-ranking.spec.ts` builds its own city to prove it. Found because a day of e2e
    runs without a reseed left 52 throwaway Berlin venues and pushed the seeded "The Copper
    Lantern" to 51st, failing four `/barfindr` tests. Those leftovers are harmless now — venues
    sharing no cluster with a search are dropped — but every registration test still adds one.
45. _Gone 2026-11-13: the flow was removed._ **Connecting a Spotify account another user already
    connected answered a raw 500.**
    `users.spotify_email` and `spotify_user_id` are UNIQUE, and `POST /api/mobile/spotify/register`
    (like the web `spotify/login` callback, which writes the same columns) does not catch the
    violation, so the second account to connect the same Spotify login gets
    `{"message":"duplicate key value violates unique constraint …"}` and no explanation. Surfaced
    2026-11-12 by the KNOWN_ISSUES 42 tests when two e2e runs reused one Spotify profile. Dormant
    while `SPOTIFY_CONNECT_ENABLED=false` in production, and gone for good if the per-user Spotify
    flow is retired (ROADMAP section 1); only worth a friendly 409 if that flow stays.
46. **`bandit` reports 80 medium findings that CI never acts on.** The Security scan steps in
    `data-collection-ci.yml` and `spotify-service-ci.yml` are `continue-on-error`, so these have
    been reported and ignored on every run (tool versions pinned since 2026-11-12, bandit 1.9.4):
    - `data_collection` (59): **`requests` calls without a timeout** (B113) in `event_fetcher.py`
      (85, 158), `soundcloud_api.py` (115, 133, 328), `utils.py` (795),
      `batch_update_city_coordinates.py`, `fetch_venue_coordinates.py` and
      `improved_venue_coordinates.py`. These are the real ones: one hung request stalls the run
      while it holds `/tmp/clubfinder_running.lock`, so later cron runs skip until someone clears
      it. The B608 "SQL injection" hits in `utils.py` (626-766) are false positives, f-strings
      with nothing interpolated and values passed as `%s` parameters; B301 (pickle) in
      `old_spotipy.py` and `simple_spotipy.py`; B108 for the `/tmp` lock path. 43 of the 59 are in
      `oldScripts/` (ROADMAP section 6 removes it).
    - `spotify_service` (21): gone with the component (retired 2026-11-13), as is its CI scan.
      Once `data_collection` is clean, drop `continue-on-error` from its scan so new findings fail
      CI. Mark genuine false positives with `# nosec B608` and a reason, not a blanket skip.

## Found during the section 1 close-out (13 November 2026)

47. _Fixed 2026-11-16 (`47660c5`), approved by the owner the same evening; live on the web since that deploy and in the app from versionCode 10._ **The legal text still describes Spotify connect.** The web privacy policy
    (`/policies/privacy-policy`, 4 mentions) and terms (`/policies/terms-and-conditions`), and the
    app's `PrivacyPolicyScreen` and `TermsScreen`, name Spotify as a data source and connected
    service. Per-account Spotify data is no longer collected, and the drop migration removes what
    was stored. Left as it is on the owner's instruction (legal copy is the owner's call).
48. _Fixed 2026-11-16 (`ab312d6`): both strings removed, on the owner's decision._ **`app_clubfindr/app.json` declares iOS Bluetooth permissions "for Spotify integration"**
    (`NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`). Nothing in the
    app uses Bluetooth since the Spotify connect removal. Left on the owner's instruction: removing
    them changes the next App Store submission.
49. _Fixed 2026-11-13._ **No venue could confirm its registration.** Two faults. `/register/confirm`
    demanded the Spotify OAuth cookies the registration form's Spotify branch left behind and
    answered 400 without them, so with `SPOTIFY_CONNECT_ENABLED=false` every web venue stopped
    there. And `bars.expires_at` was `timestamp without time zone` holding UTC wall-clock time
    (every writer stores `toISOString()`), which node-pg reads as local time, so on a server east
    of UTC (production is in Germany) a fresh 10- or 30-minute code read as expired at once on the
    web, promoter and mobile paths, and the resend throttle never applied. The check runs in SQL now
    (`$lib/server/barCodeExpiry`, `d25f205`) and the column is `timestamptz`
    (`migrations/20261113_bars_expires_at_timestamptz.sql`, `124ba76`); covered by
    `tests/venue-register-confirm.spec.ts`. Nothing tested a confirm POST before.
50. _Fixed 2026-11-13._ **Mobile venue login sent and logged Spotify secrets.**
    `POST /api/mobile/bars/login`, not behind the flag, logged the venue's Spotify app client id and
    secret and the whole response (session token included) on every login, and for a Spotify venue
    returned the client secret and the venue's decrypted Spotify tokens to the device (`401ee28`).
    Anything in the production logs from before the deploy should be treated as exposed; deleting the
    per-venue Spotify apps (`deploy/TEARDOWN-spotify-service.md`, step 9) makes those secrets useless.

Open security findings for ROADMAP section 4, noticed during the section 1 work and left alone:

51. _Fixed 2026-11-14 (`00c8e3e`)._ **Promoter auth was a plain cookie.** `/login/bars` set
    `promoterId` to the user's id, not `httpOnly` and unsigned; `/promoter-home` and
    `/promoter-home/events/*` trusted it as is, so anyone who knew or guessed a promoter's user id
    could act as them (`/api/spotify/search` accepted it too). A promoter now gets a
    `user_sessions` row, the same session a regular login creates, in the encrypted httpOnly
    `sessionId` cookie, and every promoter route resolves it and checks `users.is_promoter`
    (`$lib/server/promoterAuth`). The dashboard login reuses a live session rather than replacing
    it, so it does not log the same person out of the app; `/api/logout` ends the row and evicts
    it from the cache; the `promoterId` cookie stays, httpOnly, for the layout's partner menu
    only. Existing promoters were logged out once. Covered by `tests/promoter-auth.spec.ts`, which
    registers its own promoters so as not to share the seeded one's session (59).
52. _Fixed 2026-11-13 (`edb066d`)._ **Every venue write guard accepted a plain `barId` cookie.** `canManageBar`
    (`$lib/taste/barSession.ts`, behind `denyUnlessBarManager` in `$lib/server/barAuth`) returns true
    when `cookies.get('barId') === barId`. That cookie is set by `/login/bars` without `httpOnly` or
    any signature, so a request carrying `Cookie: barId=<any venue's id>` passes the guard on the
    mobile bar API writes (KNOWN_ISSUES 26: events, bar details, QR codes, promotions) and the venue
    taste endpoints; venue ids are in the public discovery responses. The Bearer path checks a real
    `bar_sessions` row and is fine. `/bars` also has a "Show Debug Info" panel that sets `barId` to
    any value typed in. Worse than this item first said: `/api/bars/[barId]` (GET, with the venue's
    e-mail, and PATCH, including `general_email`) had its check switched off "for debugging", so it
    needed no cookie at all. Now `/login/bars` creates a `bar_sessions` row (as the app's Bearer
    token is) in an encrypted httpOnly `barSession` cookie, `canManageBar` accepts only that or the
    Bearer token, every `/api/bars/[barId]` handler uses `denyUnlessBarManager`, `/bars` takes the
    venue from the session, the debug panel is gone and `/api/logout` ends the session. The app login
    now replaces only the app's own session (`is_mobile`), so it no longer logs the dashboard out.
    Covered by `tests/security-fixes.spec.ts` and the `canManageBar` unit tests.
53. _Fixed 2026-11-13 (`edb066d`)._ **`/login/bars` re-sent every cookie without its flags.** After `cookies.set(...)` with
    `httpOnly`/`secure`, the success path loops over `cookies.getAll()` and appends
    `Set-Cookie: name=value; Path=/` for each, which can replace them with flag-less copies (and
    echoes request cookies back). The loop is gone: SvelteKit sends `cookies.set()` with its flags.
54. _Fixed 2026-11-14 (`6973e8f`); nginx applied 2026-11-16._ **Wildcard CORS on `/api/*`.** Every `/api/*`
    response and preflight carried `Access-Control-Allow-Origin: *`, from `hooks.server.ts`, from
    four routes of their own (`/api/spotify/artists`, `/api/mobile/signup`, `/api/mobile/events`,
    `/api/mobile/bars`), and from nginx, whose `location /` and `location /api/spotify/` blocks
    added it to every response of the site and answered every preflight themselves. No
    `Access-Control-Allow-Credentials` was sent, so browsers never attached cookies cross-origin,
    but any site could read the API's answers from its visitors' browsers. `$lib/server/cors` now
    echoes `https://clubfindr.com`, `https://www.clubfindr.com`, the deployment's own `ORIGIN`, and
    under `vite dev` any localhost port; any other origin gets the answer with no CORS header, and
    `Vary: Origin` always. The native app sends no Origin and is unaffected.
    `deploy/nginx/sveltekit.config` drops its CORS blocks, and the live site file matches it
    since 2026-11-16. Between the deploy and that change both sent the header, so the site's own
    origins briefly got two `Access-Control-Allow-Origin` values. `cors.test.ts` fails if any
    other source file sets the header.
55. _Fixed 2026-11-14._ **Confirmation codes were rate-limited only in the browser.**
    `/register/confirm`, `/register/promoter/confirm`, `/api/mobile/bars/confirm`, the app's
    `/api/verify-confirmation` and `/api/verify-email-code`, and `/api/delete-user-data` accepted
    unlimited attempts at a 6-hex-digit code within its 10-60 minutes; the "3 attempts" limit was
    client-side, and only the global 60/minute IP limit applied. `bars` and `users` now carry
    `confirmation_attempts` (`migrations/20261114_confirmation_attempts.sql`): each guess spends
    one in the same `UPDATE … RETURNING` that reads the code (`$lib/server/codeAttempts`), so
    parallel guesses cannot overshoot, and at `CODE_MAX_ATTEMPTS` (5) the endpoint answers 429
    until a new code is issued; registering, every resend and the verification and deletion code
    senders set it back to 0, as does a confirmed code. In the database, not memory, so a restart
    does not refill it. The confirm pages still stop at 3 on their own; the server's 5 is the
    limit that holds. Covered by `tests/confirmation-attempts.spec.ts`.
56. _Fixed 2026-11-13: deleted (`8858d8f`)._ **`POST /api/mobile/signup/complete` needed no
    authentication**: it set `onboarding_complete` and `is_first_time` for whatever `userId` it was
    sent. Nothing in the web app or the mobile app called it.
57. _Fixed 2026-11-13 (`8858d8f`, `1e3bc71`)._ **Unauthenticated writes, debug routes and queries that
    could not run** (`docs/section4-inventory.md`). `POST /api/mobile/checkin` recorded check-ins
    for whatever `userId` it was sent, with no auth; it now takes the user from the session, checks
    the QR code belongs to the venue and uses the server's time. `/api/save-cookie-consent` took
    `userId` from the body; it uses the session. Deleted as uncalled: `/api/update-user` and the
    SoundCloud and Tidal `debug-token` routes. Queries naming tables without `clubfindr.` (the pool
    sets no `search_path`) are qualified: the mobile QR code routes, check-in and the promoter code
    resend. `/update-info` wrote a non-existent `email` column, so changing one's e-mail failed; it
    writes `general_email`, validates it and answers 409 for a taken address.
    `tests/security-fixes.spec.ts` covers each one.
58. _Fixed 2026-11-14._ **A QR code that had ever been scanned could not be deleted.**
    `user_checkins.qr_code_id` was `NOT NULL` while its foreign key to `bar_qr_codes` is
    `ON DELETE SET NULL`, so `DELETE /api/mobile/bars/:barId/qrcodes/:qrId` answered 500 for any
    code with a check-in. `migrations/20261113_user_checkins_qr_nullable.sql` drops the
    `NOT NULL` (mirrored in `dev/schema.sql`); the check-in stays, counted by `bar_id`. Found on
    the parallel branch of the 2026-11-13 security work and taken from it;
    `tests/security-fixes.spec.ts` deletes a scanned code. The spotify_service teardown runbook
    applies it by hand in step 3, since that deploy runs with `MIGRATIONS_APPLIED=1`.
59. _Fixed 2026-11-14 (`b0d972f`)._ **e2e tests raced for the seeded venue's app session.** Since
    2026-11-13 an app login as a venue replaces that venue's previous app session (`is_mobile`), so
    two tests logging `bar@clubfindr.test` into the app at the same time invalidated each other's
    token (403 "Not logged in as this venue"): 7 logins in `security-fixes.spec.ts`, 3 in
    `mobile-bar-auth.spec.ts`, 1 in `venue-taste.spec.ts`; 1 run in 2 failed locally. Each of those
    tests now registers, confirms and logs in a venue of its own (`tests/venue.ts`) and removes it
    afterwards; no seed change, so no reseed. `security-fixes.spec.ts` runs in parallel again. This
    brought out a second fault: `mobileApi` drew X-Forwarded-For from one fixed range with a
    per-worker counter, so parallel workers shared rate-limit buckets and got 429s; addresses are
    keyed by worker now. The full suite passed three runs in a row afterwards.
60. _Fixed 2026-11-14 (`72bf587`)._ **`dev/setup.sh` never checked an existing schema.** It
    loads `dev/schema.sql` only when the `clubfindr` schema is missing, then reloads the seed, so a
    dev database created before a schema change kept the old columns and constraints, and
    `dev/check-migrations.sh` and the e2e suite tested the wrong schema (on 2026-11-14 a database
    from 2026-11-10 still had the Spotify columns). When the schema exists, setup.sh now compares
    it with a scratch copy built from `dev/schema.sql` (`dev/schema-catalog.sql`) and, on any
    difference, stops before the seed with the diff and the by-hand rebuild under the e2e lease;
    it never rebuilds on its own, since every checkout shares the database.
    `dev/setup.sh --check-schema` runs only the check. CI starts from an empty database and never
    reaches it.
61. _Fixed 2026-11-14._ **Promoter registration wrote no `promoters` row.** `events.promoter_id`
    references `promoters(id)`, and `/promoter-home` keys events by the promoter's `users.id`, so
    the two ids must be the same (the seed gives the seeded promoter both). `/register/promoter`
    inserted the user and the venue but never the `promoters` row, so a promoter registered
    through the form could not create an event: the INSERT failed on the foreign key and answered 500. Found writing `tests/promoter-auth.spec.ts`. The registration transaction writes the row
    now, and `migrations/20261114_promoters_for_registered_promoters.sql` backfills the accounts
    registered before (name from the user, else their venue, else the e-mail).
62. _Fixed 2026-11-14 (`92e5289`)._ **A registered promoter's login answered 500.**
    `/register/promoter` writes a `bars` row under the promoter's e-mail with no password, and
    `/login/bars` compared the password against that null hash, which `bcryptjs` throws on, so
    every promoter registered through the form got "Error during login". The seed hid it: the
    seeded promoter's venue has a different e-mail. A venue row without a password is skipped.
63. _Fixed 2026-11-14 (`013e684`)._ **Events created on the promoter dashboard could never be
    edited or deleted.** `events.event_id` has no default and the dashboard's INSERT never set
    it, while `PATCH`/`DELETE /promoter-home/events/[eventId]` look events up by it. It is set to
    a random uuid on creation now, and `migrations/20261114_events_event_id_backfill.sql` gives
    the events created before one as well.
64. _Fixed 2026-11-14 (`62431e0`)._ **A NUL byte in any text field was a 500.** Postgres refuses
    `\u0000` in `text` and `varchar` (`invalid byte sequence for encoding "UTF8": 0x00`), and
    nothing refused it first, so a JSON string carrying one passed `$lib/server/validate`'s
    `text()` and failed at the INSERT or UPDATE. `text()`, `email()` and `stringArray()` now
    refuse control characters (tab, newline and carriage return stay allowed). Endpoints not yet
    on the helper (the write and read/search groups of the inventory) still pass one through.
    `tests/transactions.spec.ts` used a NUL byte to fail a promoter registration half-way; it
    now adds a `BEFORE INSERT` trigger on `bars` for the test, matching only its own e-mail
    prefix and dropped as soon as its request is answered.
65. _Fixed 2026-11-16 (`ab312d6`); confirm with `aapt2` on the next APK._ **The Android app asks for more than it needs, and Play's location policy tightens on
    27 January 2027.** Read from the built APK on 2026-11-16 (`aapt2 dump permissions`; target
    SDK 36, versionCode 8). Play's policy announcement of 29 October 2026 makes a Play Console
    declaration mandatory for apps holding `ACCESS_FINE_LOCATION`, justifying why coarse location
    is not enough. The app finds venues in a city and sorts them by distance, which approximate
    location (about 1-3 km) serves, so the fix is to drop `ACCESS_FINE_LOCATION` from
    `app.json` `android.permissions` and request only `ACCESS_COARSE_LOCATION` (expo-location:
    `Accuracy.Low`/`Balanced`), rather than file a declaration. Also requested, none of which the
    app needs: `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`,
    `WRITE_EXTERNAL_STORAGE`, and `BLUETOOTH`/`BLUETOOTH_ADMIN`/`BLUETOOTH_CONNECT` (the
    Spotify-era entries in `app.json`; the iOS side is KNOWN_ISSUES 48). The first four most
    likely come from library config plugins (e.g. expo-camera adds `RECORD_AUDIO` unless told
    not to); remove them with the plugins' own options or `android.blockedPermissions` in
    `app.json`, then confirm against `aapt2 dump permissions` on a fresh build, since `app.json`
    alone does not show the merged list. Play reviewers ask about `RECORD_AUDIO` and
    `SYSTEM_ALERT_WINDOW` in particular. Not affected by that announcement: local network and the
    location button (API 37+ only), contacts, SMS/call log, all-files access, accessibility.
66. _Fixed 2026-11-16 (`ab312d6`)._ **The iOS build has no camera permission text, so the QR scanner would crash on an iPhone.**
    `QRScannerScreen.tsx` uses `expo-camera`, but `expo-camera` is not in `app.json`'s `plugins`
    (only `expo-web-browser`, `@sentry/react-native`, `expo-router`), so prebuild writes no
    `NSCameraUsageDescription` and iOS terminates an app that opens the camera without one; App
    Review rejects it too. Android is unaffected (the library's manifest adds `CAMERA`). Fix: add
    `["expo-camera", { "cameraPermission": "…to scan venue QR codes", "microphonePermission":
false, "recordAudioAndroid": false }]`, which also removes the unused `RECORD_AUDIO` on Android
    (KNOWN_ISSUES 65). Found 2026-11-16 while listing what the App Store needs (ROADMAP section 5).
67. _Fixed 2026-11-16 (`05771fa`, `ef9d31c`, `8a4b728`); the app side needs the web deploy, see 79._ **The app searches the account's stored city, and nobody can change it.** Found on the first
    device run (2026-11-16): the owner's app showed London clubs. The screens read
    `AsyncStorage` `userCity` (fallback `'berlin'`), which `AuthContext`/`authService` copy from
    `users.city` at every login; the phone's location only feeds the distance filter. Every
    current sign-up path stores Berlin (`/login/users`, `/api/mobile/signup`), so London came from
    an older flow, and neither the app's Profile screen, nor `/update-info`, nor any endpoint
    writes `users.city` afterwards. Fix: propose the city from the device location (nearest of
    `data_collection/live_cities.txt`, which the app already has permission for), let the user
    confirm or pick another in the app's Profile and on the web, save it to `users.city` through an
    authenticated endpoint, and refresh `userCity` without a fresh login. Note `discoveryService`
    also hard-codes Berlin as its last-resort coordinates.
68. _Fixed 2026-11-16 (`7c05c8d`, `6f26327`, `081f3ce`); live after the web deploy._ **Venues cannot reset a forgotten password.** `/login/bars` links "Forgot Password?" to
    `/password-reset`, but `/api/request-password-reset` looks the address up in
    `clubfindr.users` only, and `/api/reset-password` writes `users.password_hash`. A venue
    registered through `/register` (or the app) logs in with `bars.password_hash` and its
    `bars.general_email`, so the reset never reaches it, and a venue whose login is forgotten can
    only be recovered in the database. Found 2026-11-16 when the owner could not log in to a venue
    for the device run. Fix: let the reset find a `bars` row too (one token table, with the
    account kind on the token), keep the same answer for unknown addresses, and offer the same link
    in the app's venue login.
69. _Fixed 2026-11-16 (`bf55d95`, `1bf4028`, `081f3ce`)._ **App login screen: invisible text, autocorrect on the e-mail, and a venue login narrower than
    the web's.** Found on the first device run (2026-11-16).
    - `LoginScreen.tsx` gives its inputs `backgroundColor: '#FFFFFF'` and no text colour, so the
      Android theme picks one, and on the owner's phone it picked white: what is typed cannot be
      seen. Set `color` and `placeholderTextColor` on every `TextInput` (other screens probably
      share the pattern; check them all on a device in dark mode).
    - The e-mail input sets `autoCapitalize="none"` but not `autoCorrect={false}`, so a keyboard
      can change the address as it is typed.
    - The web venue login (`/login/bars`) first tries a personal account (`users`, for a person
      who manages a venue) and then the venue's own login (`bars.password_hash`); the app's
      "Bar Manager Login" (`/api/mobile/bars/login`) only tries `bars`. A venue reached through a
      personal account on the web cannot log in from the app. Make both accept the same
      credentials, with one shared lookup.

## Found during the mobile app session (16 November 2026)

What each fix was, briefly; the commits have the detail. Device checks for all of it are in
`app_clubfindr/DEVICE_CHECKLIST.md`.

70. _Fixed 2026-11-16 (`8aa775c` server, `d506eb7` app)._ **Every Android venue login answered 400
    since 2026-11-14.** The input validation of `64223aa` refuses a non-string `version`, and the
    app sent `Platform.Version`, which on Android is a number (the API level). Probably why the
    owner could not log in to a venue on the first device run (68 put it down to a forgotten
    password). The server takes a number again (installed builds recover after the deploy) and
    the app sends text (works against today's server too). `tests/venue-login.spec.ts`.
71. _Fixed 2026-11-16 (`0eb25f3`)._ **Venue registration could take over any account or venue.**
    `/register` and `/api/mobile/bars/register`, before any code was entered, set the password of
    an existing personal account under the address to the one typed, and overwrote an existing
    venue's password while keeping it confirmed, so the new password worked at once. Neither
    needed the mailbox. `$lib/server/venueRegistration` links an existing account without
    changing it and refuses a confirmed venue (409, which tells a caller a venue exists under the
    address: accepted by the owner). A promoter can no longer register a real venue under their
    own address (accepted by the owner). The owner chose not to check production for past abuse.
    `tests/venue-register-takeover.spec.ts`; three of its four tests fail on the old code.
72. _Fixed 2026-11-16 (`8a4b728`)._ **The app made up venues and a position.** With no network and
    no cache it showed ten hard-coded Berlin venues ("Club XYZ, 123 Main St") as real results in
    any city, and with no GPS fix it put the phone in Berlin, so a London user's distance filter
    dropped every venue (which then brought out the fake ones). An error with "Try again" now
    (`components/LoadError`), and no position in a release build; under `__DEV__` the centre of
    the user's city (`constants/cities.ts`), as the owner asked.
73. _Fixed 2026-11-16 (`6ec97a0`)._ **A non-JSON error reply lost its status in the app.**
    NativeFetchService parsed the body before the status, so an HTML 404 (a route the server does
    not have) reached callers as a 500. The city endpoint's fallback for older servers needs the
    real 404.
74. _Fixed 2026-11-16 (`b6d6bb0`)._ **`axiosClient` dropped `params`.** The adapter passed only
    `config.data` on, so `axiosClient.get(url, { params })` sent no query string. Its one user was
    dead code against an endpoint that does not exist; it is a trap no longer.
75. _Fixed 2026-11-16 (`5ee2f8c`)._ **The app logged personal data, and every build logged.** The
    e-mail verification service logged the address and the confirmation code, signup the whole
    body (password masked), `authService` the stored user. Release builds print no console.log
    now (`utils/logger`), and `noPersonalDataInLogs.test.ts` keeps such values out.
76. _Fixed 2026-11-16 (`ab312d6`); keep in mind for any new library._ **`app.json` does not decide
    the app's permissions on its own.** `expo-location`, `expo-camera` and `expo-file-system`
    declare `ACCESS_FINE_LOCATION`, `RECORD_AUDIO` and the storage pair in their own manifests,
    and react-native's debug manifest `SYSTEM_ALERT_WINDOW`; only `android.blockedPermissions`
    removes them. And `expo-location`'s config plugin is applied even when not listed, and put
    Expo's default "Always" location texts back in the Info.plist. Check a permission change with
    `expo prebuild` plus `:app:processReleaseMainManifest` in a scratch copy of the app;
    `src/__tests__/appConfig.test.ts` holds the settings in place.
77. **`expo-notifications` brings permissions the app does not use.** `POST_NOTIFICATIONS`,
    `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE`, `READ_APP_BADGE`, FCM's
    `c2dm.permission.RECEIVE` and about 20 launcher-badge permissions; nothing in the app sends a
    notification (the Profile switch that pretended to was removed in `ed7a98e`). Left on the
    owner's instruction: they are deciding what notifications should do, and whether another
    package suits better; drop or replace it with the Expo upgrade (35).
78. **SoundCloud and Tidal connect are live on the web, outside the section 1 retirement.**
    Checked read-only on 2026-11-16; nothing changed. The policy draft (47) keeps them on the
    owner's instruction.
    - Reachable: every logged-in user sees both buttons on the home page (`/`) and on
      `/users-home`. No feature flag.
    - Flow: OAuth (`/api/soundcloud/auth`, `/api/tidal/auth` with PKCE) → the callback stores
      the access and refresh tokens **in encrypted httpOnly cookies only**, no table → `/soundcloud`
      and `/tidal` read the user's likes, playlists and artists from the provider → the user picks
      tracks → `/api/analyze-selections` → `/clubs`. Needs `SOUNDCLOUD_CLIENT_ID/SECRET` and
      `TIDAL_CLIENT_ID/SECRET` at build time (static env). The mobile app has neither.
    - Untested: nothing in the e2e suite or the mocks exercises either flow (the suite is offline
      and blocks them), so whether they still work against the live providers is unknown.
      `/soundcloud` uses SoundCloud's `v2` API for likes, which is not the documented public one.
    - **The SoundCloud callback logs the whole callback URL** (`console.log('Full URL:', ...)`,
      with the one-time OAuth `code` and `state`) and the auth step logs the `state`, into the pm2
      logs. Short-lived and single-use, but a credential in a log, and
      `no-personal-data-in-logs.test.ts` does not catch `url`/`state`/`code`. Fix when deciding
      the flows' future.
    - To decide: keep them (then a mock and an e2e spec each, and the log lines go), or retire them
      like Spotify connect (the routes, the buttons, the two policy mentions, the env keys).
79. **Until the web deploy, a city chosen in the app lives on the phone only.** Against a server
    without `PUT /api/account/city` the app keeps the choice locally and says so; the next login
    brings back the account's city. Goes away with the deploy; nothing to do but deploy.
80. **Left alone on purpose in the session, for later:**
    - Screens over 500 lines not worked in: `discoveryService.ts` (1221), `BarRegistrationScreen`
      (901), `SearchScreen` (849), `TilkiScreen` (768), `VenueDetailsScreen` (759),
      `EventFormScreen` (749), `BarHomeScreen` (599). Splitting them wants a device run each.
      _2026-11-17:_ `EventFormScreen` (353, in sections) and `BarHomeScreen` (Overview, 220) are
      done in the venue round; the customer-side ones are left.
    - _Done 2026-11-17 (`4a2c805`, `3772640`, `afe5c7e`, `6704ae6`):_ the app's lint warnings, 755
      on 2026-11-16, are 0. console.log/info/debug go through `utils/logger` (the personal-data
      guard checks `log.*` too); every StyleSheet colour is a `colors.*` token of the same value
      (`theme.ts`; near-duplicates such as `dangerBright`/`danger` not folded together, which is a
      visual change for a device run); dead code, styles and `any` are gone. Left: `npm run lint`
      still passes with warnings, so a new one does not fail CI (`--max-warnings 0` would).
    - _Done 2026-11-19 (next build):_ `VenueCard`'s "N Events Today" and "Next Event" read
      `YYYY-MM-DD` with `new Date(...)`, which is UTC midnight, so west of UTC an event could show
      a day early. `utils/venueEventDates` does the wording over `utils/localDate`, with tests
      run in a west-of-UTC zone too.
    - _Done 2026-11-16 (`708e6a7`):_ `BarRegistrationScreen` hard-coded its own 8 cities (with
      Rome and New York, which are not scraped); it uses `constants/cities.ts` now.
    - _Done 2026-11-19:_ a personal-account password reset did not end that user's session (a
      venue reset has since `7c05c8d`); it does now, in one transaction, evicting the hooks
      cache too (`tests/password-reset.spec.ts`).
    - The axios adapter turns any successful body with an `error` key into a thrown error, and
      reports every success as status 200.
    - _Done 2026-11-16 (`955916c`):_ TilkiScreen treated a malformed answer as "nothing found",
      and in date-range mode counted every failed day as no venues; both show "Try again" now.
    - `expo-dev-client` is a runtime dependency, not a dev one; move it in the Expo upgrade.
    - Sentry is initialised with an empty DSN (`App.tsx`), so release builds report nothing
      (ROADMAP section 5).
    - The debug build keeps `SYSTEM_ALERT_WINDOW` (react-native's debug manifest); Play only sees
      release builds.
    - iOS internal distribution (an ad-hoc profile in `eas.json`) waits for the Apple account.
81. _Fixed 2026-11-17 (`2ef01e3`); confirm on a device._ **A wrong password showed the generic
    login error** ("Could not log in. Please check your credentials and try again") instead of
    "Email or password incorrect". Two causes. The HTTP client's error says only "HTTP error 401"
    and keeps the server's "Invalid credentials" in `response.data`, while `loginErrorMessage` read
    only `error.message`; its tests had handed it an `Error` with the server's words, which the
    client never produces. And `LoginScreen` retried every failed customer login, a 401 included,
    against the web's `/login/users`, sending the password a second time and replacing the 401 with
    that request's outcome. The message now reads both places and takes a 401 as a wrong e-mail or
    password; the fallback is gone (also from the unused `authService.login`). The tests drive the
    real client with a mocked 401 reply.
82. _Fixed 2026-11-17 (`117091f`); confirm on a device._ **Venues could not delete an event in the
    app.** `BarHomeScreen.tsx` answered every delete with a hard-coded "Event deletion is currently
    not available. Please contact support" alert, although
    `DELETE /api/mobile/bars/:barId/events/:eventId` has existed since 2026-11-09. The button now asks
    first, then calls it through `mobileBarService.deleteBarEvent` (a 404 counts as already deleted,
    a 401/403 offers a new login) and reloads the list.
83. _Fixed 2026-11-17 (`8fb0963`), to confirm on a device._ **Sharing a QR code hung forever.**
    `QRCodeGeneratorScreen.shareQRCode` opened a modal holding only a spinner. The cause was not a
    callback that never came: Android's `react-native-svg` `toDataURL` calls back with bare base64
    (`SvgView.toDataURL`, no `data:` prefix), so `dataURL.split(',')[1]` was `undefined` and writing
    it threw inside a `setTimeout` the try/catch did not cover, so the modal was never closed. It had
    no cancel button and no `onRequestClose` either. Now `utils/qrShare` (`captureQrPng`) takes bare
    base64 or a data URL and rejects a missing ref or an empty callback (iOS calls back with nothing
    on failure), the flow is one try/catch/finally that always closes the modal, and the modal has
    Cancel and answers Android's back button. No timeout on the capture, by the owner's decision: a
    capture that never calls back leaves the spinner until Cancel. If it still fails on a device,
    see 87.
84. _Cause found and fixed 2026-11-17 (`077d147`); retest on a device._ **Check-in by scanning
    refused the venue's codes.** The server writes two forms of the same code: a new one gets
    `clubfindr://checkin?barId=…&qrId=…` (`POST /api/mobile/bars/:barId/qrcodes`), but every code in
    the venue's list gets `https://clubfindr.com/redirect?barId=…&qrId=…` (`GET` on the same route),
    and the scanner accepted only the first. So any code shared or shown from the list was refused as
    "not a valid Tilki QR code", whatever 83 did. The server keeps the `https://` form (owner's
    decision 2026-11-17: a phone's own camera opens it, and codes may already be printed with it);
    the scanner reads both through `utils/checkinCode.parseCheckinCode`, whose test also parses the
    route's two `qrValue` templates so they cannot drift apart again. A refused code no longer raises
    one alert after another while it stays in front of the camera. To retest: a code from the list,
    shared (83) and shown full-size on a second screen; a non-Tilki code (a clear "Not a Tilki
    code"); a deleted code ("Code not recognised").
85. _Fixed 2026-11-17 (`4a7d8f0`); confirm on a device._ **White text on the QR code screen could
    not be read.** The screen is styled dark (`#FFFFFF` text), but its root and loading views set no
    background, and `NavigationContainer` gets no theme, so React Navigation's light default
    (light grey) showed through. The white boxes named here hold only the QR codes, which need a
    light quiet zone, and the share card, whose text is dark since 83. The screen is `#121212` now,
    and its Delete button's `'#40000'` (five digits, no colour) is `'#400000'`. Every other venue
    screen was checked against its backgrounds: light text on `#121212`/`#1E1E1E`/`#2A2A2A`
    throughout. `screens/__tests__/screenColours.test.ts` holds every screen to a background of its
    own and every hex colour to 3, 4, 6 or 8 digits.
86. _Fixed 2026-11-17 (`b65c938`, theme `260f5e6`); check on a small phone._ **The venue side's
    navigation was cut off.** QR Codes, Artists, Edit Profile and Log Out were a row of four buttons
    across the dashboard's header, with no wrap. The venue side has bottom tabs now, like the
    customer side. Since 2026-11-17 (`58ae040`, the agreed layout): Overview (visitors, the next
    event, the check-in code), Events, Music (artists and genres you play) and Venue (Edit venue
    profile, QR codes, Log out). The forms and the QR codes open over the tabs. The dashboard reloads its events whenever it is shown. Both sides share one dark theme
    (`src/theme.ts`), passed to `NavigationContainer`.

## Found during the venue app round (17 November 2026)

Steps 1-11 of the 2026-11-17 round (ROADMAP, "Venue side of the app"); 81-86 above were fixed in
it. Device checks for all of it: `app_clubfindr/DEVICE_CHECKLIST.md` (versionCode 11). Everything
here that needs the server is collected in ROADMAP, "Next server round".

87. **Fallback for QR sharing, if `toDataURL` proves unreliable: `react-native-view-shot`.** Decided
    2026-11-17 to keep `react-native-svg`'s `toDataURL` for now (83) and add no native module. If a
    device run on either platform still cannot share (the spinner stays until Cancel, or "Could not
    share the QR code"), capture the rendered QR view with `react-native-view-shot` (`captureRef`,
    PNG, `tmpfile`) instead. It is in Expo SDK 54's supported set
    (`npx expo install react-native-view-shot`), works on Android and iOS with the new architecture,
    and writes to the
    cache, so no storage permission. It is a native module: it needs a new EAS build for both
    platforms, a check of the merged Android manifest (76), and only `utils/qrShare.captureQrPng`
    and the modal's ref change. The app is meant for both iPhone and Android, so test the share
    sheet on both before relying on either way.
88. **The web `/redirect` page sends people without the app to dead store pages.** Every code in a
    venue's list is `https://clubfindr.com/redirect?…` (84), so a phone's own camera opens
    `routes/redirect/+page.svelte`, which tries the `clubfindr://` deep link and after two seconds
    falls back to a store. Its store links are placeholders and disagree with each other: the App
    Store's `idXXXXXXXXXX` (twice), and Play's `com.clubfindr.app` in the script and `com.tikli.app`
    on the badge, while the app is `com.clubfindr.mobile`. A scan by someone without the app
    therefore ends on a store page that does not exist. Left out of the 2026-11-17 app round on the
    owner's instruction (it is a server change, with its e2e run). Fix: Play's
    `https://play.google.com/store/apps/details?id=com.clubfindr.mobile` in both places, and the App
    Store link (or none) until the app has an App Store record (ROADMAP section 5, "iPhone / App
    Store"); its two-second fallback also fires when the app did open, which is worth a look then.
    _Fixed 2026-11-19._ `$lib/storeLinks` names the app (`com.clubfindr.mobile`, held to
    `app_clubfindr/app.json` by `storeLinks.test.ts`), the App Store link is `null` until there is
    a record (an iPhone sees a note instead), only an Android phone is sent to Play by itself and
    only while the page is still visible, and `tests/redirect.spec.ts` covers the three cases.
89. **Deleting a recurring event deletes the whole series.** A recurring venue event is one
    `bar_events` row (a start `event_date`, `recurring` and a free-text `recurrence_pattern`), with
    nowhere to record a skipped date, so the app's delete (82) and the web's both remove every
    occurrence. _Fixed 2026-11-19._ `clubfindr.bar_event_skips` holds the cancelled dates,
    `$lib/events/recurrence` leaves them out and every reader attaches them before expanding, so
    the night goes from the venue's list, from both matchers and from `/barfindr` while the series
    goes on. `DELETE …?date=YYYY-MM-DD` cancels one date (idempotent; a malformed date is refused
    rather than deleting the series), and both the app and the dashboard ask "this date only" or
    "every date" for a repeating night. `tests/cancel-one-date.spec.ts`.
90. **Recurring venue events only exist on their first date.** Found 2026-11-17. A recurring event
    is one `bar_events` row (a start `event_date`, `recurring`, a free-text `recurrence_pattern`),
    and nothing on the server expands it into dates: `POST /api/mobile/bars/matching` selects
    `event_date = <the day>`, `/barfindr` and `GET /api/mobile/bars/:barId/events` select
    `event_date >= <today>`. So a weekly night counts towards matching on its first date only, and
    after that date it is gone from `/barfindr` and from the venue's own event list in the app,
    though still in the database. The app's form offers daily, weekly, bi-weekly and monthly.
    _Fixed 2026-11-19._ `$lib/events/recurrence` is the one place that says which days a series
    falls on (daily, weekly, biweekly, monthly; UTC date parts, so no server time zone moves a
    night; monthly keeps the day of the month and skips months without it). Both venue event
    lists, `POST /api/mobile/bars/matching` and `/barfindr` read it, the lists send one entry per
    date with an `occurrence_id` to key on (repeating series bounded by 60 days, one-offs listed
    however far ahead), and the write paths validate the pattern, storing it normalised.
    `tests/recurring-events.spec.ts`, `src/lib/events/recurrence.test.ts`. Still open: cancelling
    one date rather than the series (89).
91. **The genres a venue is offered and the genres the server accepts come from different places.**
    Found 2026-11-17. The app's "Genres you play" and event genres suggest the 1,243 names of
    `clubfindr/static/lib/unified-genres.json` (the web dashboard's list, held equal by
    `genreVocabulary.test.ts`), but `PUT /api/venues/:barId/taste/genres` accepts what
    `isKnownGenre` places in a cluster (`$lib/server/genreMatching`, the clusters and aliases),
    which no JSON file lists. So a suggestion can be refused ("Not genres Clubfindr knows: ..."),
    on the web as in the app; the message covers it, nothing breaks. A third copy,
    `clubfindr/src/lib/data/unified-genres.json` (953 names), differs from both. Event genres are
    not checked at all (free text). _Fixed 2026-11-19._ `pnpm convert-genres` now also writes a
    flat `genre-suggestions.json` (1,238 names: every leaf, every sub-cluster name that holds
    leaves, every `UMBRELLA_FAMILIES` term, minus `UNSCORED_GENRES`) to `static/lib/` and the
    app's `constants/`, and every picker reads it — the dashboard's "Genres you play", the app's
    `genreVocabulary` and the dashboard's event modal, which had a fourth hard-coded list.
    `src/lib/taste/genreSuggestions.test.ts` holds the list to `isKnownGenre` entry by entry, so
    the two cannot drift apart, and plain "house", "rock" and "hip hop" are offered at last.
    Event genres are strict too (`$lib/taste/eventGenres`, all four write paths,
    `tests/event-genres.spec.ts`). The dead third copy under `src/lib/data` is gone.

## Found during the device run (18 November 2026)

92. **The Spotify step checks arbitrary artists, not the ones playing upcoming events.** Found
    2026-11-18 by the server instance, after the daily scrape was restored (`1c98caa`).
    `data_collection/spotipy_search.py` `get_artists_query()` selects
    `primary_city = %s ORDER BY id LIMIT 1000`, so in a big city each run spends its lookups on old
    artists: London had about 9,600 artists stored and 331 upcoming artists without a Spotify
    match, and only 11 of those were checked that day. The Spotify API itself works (searches
    match, about half the artists have genres). Upcoming events whose artists stay unmatched get
    no genres, so they match nobody's taste. SoundCloud's step takes every artist with a link and
    is not affected. _Fixed in the repo 2026-11-18_: the selection
    (`data_collection/artist_selection.py`, unit tests in `data_collection/tests/`, fake rows
    only) fills the per-run cap (`SPOTIFY_ARTISTS_PER_RUN`, still 1,000) in tiers — upcoming
    artists without a `spotify_uri` soonest event first, then upcoming artists without genres,
    then the rest by id — with the 14-day cooldown applied before the cap and the per-tier counts
    logged and printed. To verify after the next 02:00 run (server instance): the printed
    "Artist selection for <city>" summary, and that London's unmatched upcoming artists drop from
    ~331 instead of 11 being checked.

## Found during the device run (19 November 2026)

93. **`/clubs` showed Berlin in the heading and Amsterdam's clubs on the cards** after the city was
    changed from Amsterdam to Berlin on `/update-info` (DEVICE_CHECKLIST, versionCode 12 round,
    section 1). Not the page: the heading and the cards come from one load and one `city`
    (`routes/clubs/+page.server.ts` selects `WHERE city = $1`), and
    `tests/users-home-city.spec.ts` ("the cards follow the heading") walks the owner's path on
    the dev database and passes. So the rows themselves carry the wrong label: production
    `clubfindr.events` rows with `city = 'berlin'` whose `club_address` is in Amsterdam. The one
    way the fetcher produces that is a run whose city name and RA area code disagree
    (`event_fetcher.py … berlin 29 nl` labels Amsterdam's listing "berlin"), and until
    2026-11-19 the events upsert (`ON CONFLICT (event_id, event_date)`) never updated `city`, so
    the nightly run could not repair it. _Hardened 2026-11-19_: `event_fetcher.py` refuses a
    city/area/country triple that is not a line of `live_cities.txt` (`data_collection/live_cities.py`,
    exit 2 before any request), `data_collection.py` reads the file through the same parser, and
    the upsert sets `city = EXCLUDED.city`, so the next correct run relabels every event it still
    lists. **To do on the server** (owner or server instance): confirm and measure with
    `SELECT city, club_name, club_address, count(*) FROM clubfindr.events WHERE event_date >= CURRENT_DATE AND club_address NOT ILIKE '%' || city || '%' GROUP BY 1, 2, 3 ORDER BY 1, 2;`
    (an address that does not name its own city; Berlin and Amsterdam addresses do), and check
    `data_collection/logs/` for a hand run around 2026-11-18. Events the next 02:00 run no longer
    lists (past, or removed from RA) keep the wrong label until they age out; delete them by hand
    if the query shows any left after that run. _Checked on production by the owner, 2026-11-19:_
    **no Amsterdam venue is stored under Berlin.** The query returned only venues whose address
    does not name the city, one Uppsala venue under Stockholm and one Guadalajara venue under
    Madrid (both plausible for RA's areas), and some TBA or garbled rows. So the data is not the
    cause either, and what was seen is **not reproduced**: the page and the rows both say one
    city. The likeliest remainder is a stale page (a `/clubs` tab or a back-navigation showing
    the Amsterdam search from before the change, with the heading re-rendered from the new
    cookie is _not_ possible, so more likely the whole page was the older one). The fetcher
    guard and the relabelling upsert stay as preventive hardening. If it shows again: note the
    exact navigation (which link or button led to `/clubs`), the date shown, and one club name
    from the cards, so the row can be found.

94. **An event's genre list can carry a few genres from another world, and then it matches
    people who want that world.** Seen 2026-11-19 by the owner: a profile built from punk bands
    (Pennywise, NOFX; new wave, post-punk, hardcore punk and their neighbours) got two `/clubs`
    results, one fitting and one techno/house night whose twenty-odd genres included `hardcore
    punk`, `post-hardcore`, `screamo` and `mathcore` beside `german hip hop`, `german indie pop`,
    `coco` and `none`. Causes, in the pipeline: a scraped event's `event_genres` is the union of
    every line-up artist's genres (`spotipy_search.update_event_genres`: `event_artists` →
    `artists.genres`, replacing RA's own tags), and an artist's genres come from the **top
    result of a Spotify name search** (`sp.search(name, type="artist")`, first item), so a DJ
    who shares a name with a hardcore band imports that band's genres into every night they
    play (KNOWN_ISSUES 19 is the same name-only matching on the taste side). `none` and `coco`
    show that the cleaning pass lets through tags the clusters do not know. On the matching
    side the event is an unweighted set, so one artist's four odd genres weigh as much as the
    night's twenty; the similarity stays above zero, and `MIN_SIMILARITY` keeps anything above
    zero (ROADMAP section 2), so the night is listed. Also found on the way: the card's
    "Matching Genres" heading lists the event's **whole** genre list (`result.genres`), not the
    genres that matched (`matchingGenres`, which the matcher already returns and the page
    ignores), so the person cannot see why the night was offered (personas.md, rule 1).
    **Owner's intent (2026-11-19): look into removing odd-ball genres before they reach the
    event data** when an event has a clear trend and a couple of outliers. Options, for the
    ROADMAP item (section 6): (a) at the Spotify step, verify the matched artist against the
    event's other artists (same top-level cluster family, or an exact name match plus RA's own
    genres) before taking its genres; (b) a per-event outlier pass after the union, dropping
    genres whose top-level cluster holds a small share of the event's genres and comes from a
    single artist; (c) at the matcher, weigh each event genre by how many artists carry it
    (the duplicates in the owner's list are that count showing through), so a lone artist's
    genres count less without a data change; (d) drop `none` and unknown tags in the cleaning
    pass. (a) and (d) fix the data for every reader including the app; (c) is the cheapest and
    can go first. _The card part is done 2026-11-19_: `calculateClusterSimilarity`
    also returns `matchingClubGenres` (the club side's own genres that matched) and the `/clubs`
    card shows those first and only, with the match as a percentage ("33% match · 1 of 3
    genres") and a per-card "Show all N genres". _Options 2 and 3 done 2026-11-19 (owner's
    decision; 1 and 4 not taken):_ `pnpm convert-genres` writes `data_collection/known_genres.json`
    (every genre the matcher places, with its top-level cluster, held to `findClusters` by
    `knownGenres.test.ts`); `data_collection/known_genres.py` keeps only those names on artists
    and events (the Spotify and SoundCloud steps and the event update; the 6,428-entry CSV and
    its substring matching are out of the path), and a Spotify match whose genres share no
    top-level cluster with the rest of the line-up (the other artists' genres and the events'
    tags) is taken for the wrong artist: nothing of it is stored, the artist's earlier genres
    and URI are dropped and its events rebuilt, and the refusal is logged (`lineUpFit`). **To
    watch after the next runs (server instance):** the `lineUpFit` lines for a week, for a real
    eclectic act refused; and that polluted events clear only as their artists come round again
    (the 14-day cooldown), unless a one-off re-clean is run by hand.

95. _Fixed 2026-11-19 (owner's decision)._ **An account had one session at a time.**
    `user_sessions` carried `UNIQUE (user_id)` and every login upserted on it, so logging in on
    the website logged the phone out and the other way round (found while testing the password
    reset: a web login and an app login could not both be alive). The constraint is gone
    (`migrations/20261119_user_sessions_many_per_user.sql`, applied by the deploy; `session_id`
    is unique and `user_id` indexed instead), `$lib/server/userSessions.openUserSession` is the
    one way a login opens a session (a plain insert that also drops the account's rows unused
    for seven days), and the promoter dashboard login no longer has to reuse the app's session
    to keep it alive. Logout ends the one session, a password reset and an account deletion end
    them all. `tests/password-reset.spec.ts` holds a web and an app session at once.
