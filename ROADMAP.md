# Roadmap

Planned work for the Clubfinder monorepo. Detailed findings live in
[`docs/analysis/`](docs/analysis/README.md) and
[`clubfindr/docs/KNOWN_ISSUES.md`](clubfindr/docs/KNOWN_ISSUES.md); this file is the
ordered list of what I intend to do next.

## Tonight's device run (2026-11-17, versionCode 11)

The 2026-11-17 app round is done (below, "Venue side of the app", steps 1-11): every failure and
issue of the versionCode 10 run is fixed (KNOWN_ISSUES 81-86), the venue side has its agreed four
tabs, and the app has no lint warnings. App-only, so no deploy is needed. The owner's checklist:
[`app_clubfindr/DEVICE_CHECKLIST.md`](app_clubfindr/DEVICE_CHECKLIST.md), which also carries what
the last run left untested (a personal account with no venue, the venue password reset, a non-Tilki
QR code, the web city change, and the "changed in passing" items).

## From the 2026-11-18 device run (in progress)

The owner is running the checklist on an emulator (dev build of versionCode 11) and a phone;
results, causes and file references are in
[`app_clubfindr/DEVICE_CHECKLIST.md`](app_clubfindr/DEVICE_CHECKLIST.md) ("Found during the
2026-11-18 run" and the FAIL notes).

**Web: `/users-home` is where a logged-in user searches, from their saved city** (owner's
decision, 2026-11-18; **done in the repo the same day**). Fixes the city FAIL (section 10 of the
checklist): the page used to guess the city from the browser's location, never read `users.city`,
and a search posted the guess to `/storestate`, which overwrote the `city` cookie, so a city saved
on `/update-info` lasted until the next search. Now "Current City" starts from the account's city
(location is only a proposal for an account with none, offered as "Save <city> as your city");
"Change City" saves through `PUT /api/account/city` (one city per user across `/users-home`,
`/clubs`, `/barfindr` and the app); and the page's "Find events" search posts exactly the shown
city — date + city + taste profile → `/clubs`. `/` keeps location guessing for visitors.
`tests/users-home-city.spec.ts` covers the ROADMAP's Amsterdam journey.

Also on the web, from the same run:
- **Fixed in the repo 2026-11-19.** `/update-info`'s city picker was white on white: the `@theme`
  in `src/app.css` reset the palette and defined only eight numbered colours, so forty-odd
  utilities across the site generated no CSS. Every used colour is now defined at the Tailwind 3
  defaults, and `src/lib/themeTokens.test.ts` fails when a used colour has no token
  (the semantic-token move stays KNOWN_ISSUES 7)
- **Fixed in the repo 2026-11-19.** `/clubs` said "Unknown City" when a city had no events that
  day: the empty and error returns carry `city` now, and the page says "There are no events in
  <city> on <date> yet", distinct from "events, but none match your taste"
- **Also 2026-11-19 (owner's decision):** new accounts no longer default to Berlin — `users.city`
  starts empty and `/users-home` proposes the nearest covered city on the first visit; the logins
  tolerate an account without a city
- Plain "House" (and "Rock", "Hip Hop") are not in the genre suggestions, app or web, though the
  server accepts them: part of **One genre list** below (KNOWN_ISSUES 91)
- A venue password reset mail lists the personal account's link first; started from the venue
  login (`?from=bars`), put the venue link first or alone

**Data: no club events at all** (found 2026-11-18; **fixed the same day** in `1c98caa`). The
event scrape had been disabled since Aug 2025, so the app's Clubs side and `/clubs` were empty.
The server instance fixed the fetcher and re-enabled the cron at 02:00; check Tilki → Clubs after
the first run.

**Data: the scrape is back (`1c98caa`, daily at 02:00), but the Spotify step checks the wrong
artists** (KNOWN_ISSUES 92). **Fixed in the repo 2026-11-18**: the selection is a pure function
(`data_collection/artist_selection.py`) filling the per-run cap in tiers — upcoming artists
without a `spotify_uri` soonest event first, then upcoming artists without genres, then the rest —
with the cooldown applied before the cap and per-tier counts logged; unit tests over fake rows in
`data_collection/tests/` (no live API or database calls; CI left as-is, owner's decision).
After the next 02:00 run the server instance checks: the printed "Artist selection for <city>"
summary (tier counts), and how many upcoming artists per city are still without a `spotify_uri`.

**Venue accounts cannot be deleted** (found 2026-11-18; **fixed in the repo the same day**):
Google Play's account-deletion policy covers venue accounts too. `$lib/server/deleteVenue` hard
deletes the venue and everything it owns in one transaction (sessions included; the registering
personal account stays), behind `denyUnlessBarManager`: on the web a "Delete this venue" section
on `/bars` (DELETE `/api/bars/:barId`, live with the next deploy), in the app a row on the Venue
tab (DELETE `/api/mobile/bars/:barId`, in versionCode 12, needs its device run).
`tests/venue-delete.spec.ts`. The test venue "New test bar" is removed on the server by the owner
(or now from the app/dashboard once deployed).

**Sign-up: straight in after verifying** (owner's request, 2026-11-18; **done in the repo
2026-11-19**): `/api/verify-email-code` answers a successful verification with a session (the
same token/user shape as `/api/mobile/login`) and the app signs in with it, landing in the artist
picker with no second login; an older server falls back to "You can now log in". Mobile sign-up
also lost its Berlin default (`tests/signup-verify-session.spec.ts`). Needs the web deploy before
the versionCode 12 device run.

**App** (**all fixed in the repo 2026-11-19**; needs a new build, versionCode 12, checklist in
[`app_clubfindr/DEVICE_CHECKLIST.md`](app_clubfindr/DEVICE_CHECKLIST.md)):
- QR sharing failed for every code: the id is a number from the server; typed as one now and
  `qrShareFilePath` takes both (unit test with a numeric id). Cancel and Android's back during
  "Preparing…" go back on the device checklist
- Bar Registration refused international phone numbers: `utils/telephone` now mirrors the
  server's rule (7-15 digits, formatting ignored)
- The network banner never hid after coming back online: visibility is derived from state now
  instead of being decided in the once-registered listener's closure (component test)

## Next server round

Found or decided during the 2026-11-17 app round and left for the server, in a suggested order.
Each is a server change with its e2e run under the lease.
1. **Recurring events as dates** (KNOWN_ISSUES 90): expand them on the server, one occurrence
   function for the venue list, both matchers and `/barfindr`, the pattern validated. Today a
   weekly night counts on its first date only and then disappears. Then **cancel one date** rather
   than the series (89). Details in section 5
2. **Live music as an event filter, not a genre** (owner's decision, 2026-11-17): an event
   attribute set in the app's and the web's form, a customer filter with the genres underneath,
   existing "Live Music" tags migrated. Details in section 5
3. **One genre list** (KNOWN_ISSUES 91): the suggestions (app and web) and the server's check
   (`isKnownGenre`) from the same source, a test that every suggestion is accepted, then strict
   event genres; and a test across app and server that the two agree
4. **The `/redirect` page's store links** (KNOWN_ISSUES 88): Play's `com.clubfindr.mobile`, the App
   Store once the app has a record; people without the app scanning a venue code reach a dead page
5. **Real venue insights** in place of the removed "Genre Matches" tile (always 0, no data behind
   it): check-ins per night, matched visitors, once there is data to count

Still open from earlier: a personal-account password reset that ends that user's sessions
(KNOWN_ISSUES 80), the SoundCloud and Tidal decision and their callback logging (78), and
`SMTP_TLS_VERIFY` in production (15).

## Left on the app side (next app round)

- `VenueCard`'s "Events Today" / "Next Event" read dates as UTC, a day early west of UTC
  (KNOWN_ISSUES 80; a one-line fix with `utils/localDate`, changes what customers see)
- Fold the palette's near-duplicates (`dangerBright`/`danger`, `grey800`/`card`, …) into the core
  tokens, with a device run (KNOWN_ISSUES 80)
- If QR sharing still fails on a phone: `react-native-view-shot` (KNOWN_ISSUES 87), on both
  platforms
- Split the customer-side screens over 500 lines (KNOWN_ISSUES 80), one device run each
- The Expo patch upgrade with `expo-auth-session` removed (35) and the notifications decision (77);
  R8 and Sentry (section 5)

## Venue side of the app: decided 2026-11-17

Option C of the 2026-11-17 review: four tabs by how often a venue uses them, **Overview · Events ·
Music · Venue**, so no single screen holds stats, events, taste and settings at once.
- **Overview:** tonight at a glance (visitors, the next event, a "show check-in code" card)
- **Events:** the venue's events, add, edit, delete; recurring dates once the server expands them
- **Music:** the artists you play and the genres you play (one genre list, the one the matcher
  accepts)
- **Venue:** edit profile, QR codes, log out; where later settings go

The 2026-11-17 app round does it in three steps, each with its own commits and the app's checks:
7. [x] Music tab: Artists becomes Music, with a "genres you play" editor (section 5). Done
   2026-11-17 (`4ac6131`, `2192782`)
8. [x] Overview cleanup: no always-0 "Genre Matches" tile, a `VenueContext` for the venue's id and
   name, the event form on the shared genre list. Done 2026-11-17 (`ef5f1ff`, `57f6f82`,
   `cde6383`)
9. [x] Events and Venue tabs, together for one device run: events leave the dashboard, the event form
   is split into sections, QR codes and Profile go into Venue. Done 2026-11-17 (`391f8ea`,
   `58ae040`, `a0675e4`)

10. [x] The lint warnings (KNOWN_ISSUES 80): 682 to 0, and `--max-warnings 0` so CI keeps them
    at 0. Done 2026-11-17 (`4a2c805`, `3772640`, `afe5c7e`, `6704ae6`, `63c6e24`)
11. [x] Hand-over: the device checklist for versionCode 11 (`fac23e7`), KNOWN_ISSUES (87-91),
    this ROADMAP and `app_clubfindr/CLAUDE.md`. Done 2026-11-17

Steps 1-6 of the same day, before the venue review: QR sharing (83, `8fb0963`), check-in codes in
both forms (84, `077d147`), event delete (82, `117091f`), the QR screen's contrast (85,
`4a7d8f0`), the wrong-password message (81, `2ef01e3`), and the first venue bottom tabs with one
dark theme (86, `260f5e6`, `b65c938`).

## Today's session (2026-11-16): the mobile app

**Agents: this section is the brief for today's session.** It ends in an Android build that the
owner installs from Play internal testing and tests on a phone this evening, so everything must be
finished, committed and checked by the end of step 6. The items it draws on are in section 5
("Mobile app" and "iPhone / App Store") and KNOWN_ISSUES 29, 35, 47, 48 and 65-69; 65-69 come from
the first device run, earlier today.

**Rules for the whole session.** State which worktree you are in in every reply. Run every
command, build and test in the foreground. Coordinate the shared database with
`dev/e2e-lock.sh run --wait` and never reseed it. Small atomic commits; do not push. In every
reply, sections for: what changed, what broke and how you fixed it, checks run, decisions for the
owner. Every app change passes the app's four CI checks (`npm run lint`, `npm run typecheck`,
`npm test`, `npx expo export --platform android`); server changes also pass the clubfindr checks
and their e2e specs. Do not change `app.json`'s `versionCode` (the owner's build bumps it) and do
not build with EAS. Run git from the repository root (`app_clubfindr/` holds an old nested
`.git`, KNOWN_ISSUES 34).

**Owner's decisions, already made:** remove the iOS Bluetooth texts (KNOWN_ISSUES 48); the app is
iPhone only (`supportsTablet: false`); the agents draft a new Privacy Policy and Terms without
Spotify for the owner to approve (KNOWN_ISSUES 47). Left out on purpose, each needing its own
device run: R8 and the Expo patch upgrade.

1. [x] **Baseline, no code.** Read the app end to end and the items above. Report what you would
   clean up or restructure and why, anything broken the docs do not list yet, and a plan for
   steps 2-6 with any further decisions you need.
2. [x] **Login and accounts** (KNOWN_ISSUES 69, 68). Visible text in every `TextInput` on light
   and dark phones (explicit `color` and `placeholderTextColor` everywhere, not only the login
   screen); `autoCorrect={false}` on e-mail fields; one shared venue-login lookup so the app
   accepts the same credentials as the web `/login/bars` (personal account first, then the
   venue's own); a password reset that also reaches venue logins, linked from the app's venue
   login too.
3. [x] **City** (KNOWN_ISSUES 67). Propose the city from the device location (the nearest city in
   `data_collection/live_cities.txt`), let the user confirm or change it in the app's Profile and
   on the web, save it to `users.city` through an authenticated endpoint, and refresh the app's
   `userCity` without a new login. Remove the hard-coded Berlin fallbacks where they mislead.
4. [x] **Permissions and store readiness** (KNOWN_ISSUES 65, 66, 48; "iPhone / App Store" below).
   Coarse location only; the `expo-camera` config plugin with a camera message and the
   microphone off; trim the unused Android permissions, checking the merged list with
   `npx expo prebuild --platform android --clean` in a scratch copy, never the repo's `android/`;
   drop `NSLocationAlwaysUsageDescription` and the two Bluetooth texts; `supportsTablet: false`;
   iOS settings in `eas.json` and `cli.appVersionSource`.
5. [x] **Cleanup, refactor and the policy draft.** Dead code and debug screens, `any` types in the
   services, `console.log` gated for production builds, unit tests for the services steps 2-4
   touched, and splitting screens over 500 lines only where you are already working in them.
   Draft the Privacy Policy and Terms without Spotify (app screens and web `/policies/*`) as a
   separate commit, marked for the owner's approval.
6. [x] **Hand-over.** A device checklist for this evening (each fix above, plus the venue
   dashboard, creating, sharing and deleting a QR code, and check-in by scanning), updated
   KNOWN_ISSUES, ROADMAP and `app_clubfindr/CLAUDE.md`, and a list of what you found but left for
   later.

**Done 2026-11-16** on branch `hfi/…/oak`, not pushed. Tonight's device run:
[`app_clubfindr/DEVICE_CHECKLIST.md`](app_clubfindr/DEVICE_CHECKLIST.md). Found on the way and
fixed: every Android venue login had answered 400 since 2026-11-14 (KNOWN_ISSUES 70), and venue
registration could take over any account or venue (71); the rest is KNOWN_ISSUES 70-80. Waiting on
the owner: done the same evening. The policy draft (47) was approved, and the web side was
deployed (`49f279c`), so the venue reset, the personal-account venue login and the city endpoint
go live (79; the migration only adds a table, so `deploy.sh` applies it). Follow-ups: SoundCloud and
Tidal (78), `expo-notifications` (77), and the list in 80.


## 1. Move away from Spotify for users

Spotify's development-mode limits cap each app at a handful of users, so per-user
Spotify integration no longer scales.

The goal: a new user gets useful personalised results in under a minute without
connecting any streaming account, and results get better the more they use the app.
Per-user Spotify connect goes; one server-side Spotify app stays, for artist data only.

- [x] Retire `spotify_service` (automated Spotify developer app management) and its
      systemd units, cron jobs and deploy steps, done in the repo 2026-11-13 (`a5f407f`): the
      directory, its CI, its deploy.sh restart and health check, the unit copies, sudoers lines
      and the nginx `/api/user/` block are gone. The server side is by hand, see the follow-up
      below and [`deploy/TEARDOWN-spotify-service.md`](deploy/TEARDOWN-spotify-service.md)
- [x] Keep a single Spotify app for server-side artist data lookups only, done 2026-11-13: the
      per-account and venue OAuth code is deleted, not just flagged off (web `07ccf4a`, mobile API
      `5780603`, venues `795f4e9`, app `b3f12f7`), and `SPOTIFY_CONNECT_ENABLED` is no longer read
      (`/api/mobile/config` answers `false` for older app builds). Everything Spotify-backed now
      runs on the one client-credentials app (`$lib/taste/spotifyArtistLookup`): the artist
      pickers, the guest artist-or-song search (`037dcb7`, which had stored that token in the
      per-user cookie and logged it) and the promoter track search (`09fdbb3`, broken for
      promoters until then). The Spotify tables and columns go with
      `migrations/20261113_drop_spotify_connect.sql` (`4b22fbb`), applied by hand per the runbook
- [x] Make Last.fm import and manual genre picks the main ways to build a taste profile, done
      2026-11-13 now that the Spotify paths are gone: the artist picker is the signup path on
      web and app, the Last.fm import and genre picker feed matching, and the app's Discover and
      Search tabs work from the taste profile instead of the user's Spotify library (`6cd07f7`)
- [x] Artist picker onboarding as the default signup path: the user names 3-5 artists,
      autocomplete goes through the server-side Spotify app (`spotifyArtistLookup.ts`),
      and the genres of those artists feed the taste profile
      (web: `/onboarding`; app: `ArtistPickerScreen` after login, from `user.artistOnboarding`)
- [x] Genre fallback for picked artists from Last.fm `toptags` or MusicBrainz tags, in
      case Spotify artist objects stop carrying `genres` (KNOWN_ISSUES 21).
      `$lib/taste/genreFallback.ts`, applied when an artist is added; still only verified
      against the mocks, not the live APIs
- [x] Remove the Spotify connect step from web and mobile signup (`musicService` choice,
      `spotify_service` add_user call; KNOWN_ISSUES 24). First behind
      `SPOTIFY_CONNECT_ENABLED=false`, covering users and venues; since 2026-11-13 the connect
      code is deleted and the flag is no longer read (`/api/mobile/config` answers `false`)
- [x] Fix `/bars` so a venue can create events without connecting Spotify (KNOWN_ISSUES 4)
- [x] Venues set their genres and typical artists by hand through the same picker, and
      `barfindr` stops polling venue Spotify playback. Done in three pieces:
      the artist picker (`/api/venues/:barId/taste`, the bar dashboard and the app's bar
      dashboard, feeding matching); **polling retired 2026-11-12** (the `spotify_genre_polling`
      and `process_bar_batch` tasks, their beat entry and `barfindr`'s `spotify_service.py` are
      gone; the remaining aggregate and cleanup tasks drain `bar_genre_profiles` and
      `bar_genre_aggregates` within 24 hours of the deploy; `spotipy` left
      `requirements.txt` with the `spotify_service` retirement, `ac4f6a4`); and **bare genres,
      also 2026-11-12**
      (`bars.declared_genres`, `GET`/`PUT /api/venues/:barId/taste/genres`, the "Genres you
      play" dashboard section): a venue says "we play techno" with no artist needed, only
      genres the cluster matcher knows are accepted, and both matchers fold them in at the
      same weight as the venue artists' genres. The app's bar dashboard has no UI for them
      yet (the endpoint takes its session token already; see section 5)
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

- [x] Run [`deploy/TEARDOWN-spotify-service.md`](deploy/TEARDOWN-spotify-service.md) on the
      server, done 2026-11-14 with the deploy of `7122896` (steps 0-9; the barfindr wind-down,
      step 10, is still open and waits for its tables to empty). Left for the owner: deleting
      the four connect apps on the Spotify dashboard
- [ ] Run the app on a device before the next release (KNOWN_ISSUES 29): Discover, Search,
      signup and venue registration all changed in section 1 without a device run. Started
      2026-11-16 on Android (versionCode 9, Play internal testing): onboarding, adding genre groups
      and club matching work; the city was wrong (KNOWN_ISSUES 67). Venue dashboard, QR codes and
      check-in still to test
- [x] **Done 2026-11-16 (`47660c5`), approved by the owner; live on the web, in the app from versionCode 10.** Privacy Policy and Terms (app screens and web `/policies/*`) still name Spotify as a data
      source and connected service (KNOWN_ISSUES 47). **Decided 2026-11-16: the agents draft the
      new wording, the owner approves it before it ships** (today's session, step 5)
- [x] Done 2026-11-16 (`ab312d6`). `app_clubfindr/app.json` still declares the iOS Bluetooth permissions "for Spotify
      integration" (KNOWN_ISSUES 48). **Decided 2026-11-16: remove them** (today's session, step 4)
- [ ] Remove the now unused `expo-auth-session` from the app with the Expo upgrade
      (KNOWN_ISSUES 35)
- [ ] Owner, in Play Console: declare trader status (required from November 2026), and check
      the app against the February 2027 memory and code-size quality requirements (the release
      APK is 123 MB; the Expo upgrade is the natural time to look)
- [x] Done 2026-11-16 (the live site now matches `deploy/nginx/sveltekit.config`). By hand on the server, after the deploy of `6973e8f` or later: take the CORS blocks out of
      the live nginx site (KNOWN_ISSUES 54). In `/etc/nginx/sites-available/sveltekit.config`,
      in both `location /api/spotify/` and `location /`, delete the three
      `add_header 'Access-Control-…' '*' always;` lines and the whole
      `if ($request_method = 'OPTIONS') { … return 204; }` block (the repo copy in
      `deploy/nginx/` shows the result; edit the live file rather than copying it over, since
      certbot manages parts of it), then `sudo nginx -t && sudo systemctl reload nginx`. Check:
      `curl -sI -H 'Origin: https://evil.example' https://www.clubfindr.com/api/mobile/config`
      shows no `access-control-allow-origin`. Until then nginx keeps adding its wildcard
- [x] Venues could not confirm a registration, fixed 2026-11-13 (`d25f205`, `124ba76`): the web
      confirm step demanded Spotify cookies, and every venue code read as expired on a server
      east of UTC (KNOWN_ISSUES 49)
- [x] Mobile venue login sent and logged Spotify secrets, fixed 2026-11-13 (`401ee28`,
      KNOWN_ISSUES 50)

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
- [x] Nudge existing users with fewer than 3 favourite artists towards `/onboarding`, done
      2026-11-12: `/users-home` shows a banner for a profile below `ONBOARDING_MIN_ARTISTS`,
      counting what is there and linking the picker; it disappears at 3. A nudge, not a
      redirect — someone who skipped the step on purpose is not trapped
      (`tests/onboarding.spec.ts`)
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
- [ ] Tonight's vibe and saved mixes: search artists on the fly for a temporary list that
      matching uses for the night instead of the profile (which it never changes), and keep
      named mixes to reuse; a mix is a user-chosen "side" (section 2). Design only so far:
      [`clubfindr/docs/tonights-vibe-proposal.md`](clubfindr/docs/tonights-vibe-proposal.md)
      (open questions: expiry, replace vs blend, venues, naming)
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
- [x] Store the refreshed Spotify token expiry (KNOWN_ISSUES 2), or drop the flow with section 1:
      dropped with it (2026-11-13), so there is no per-user token to refresh
- [ ] Input validation on all API endpoints and an audit of raw SQL. Inventory taken
      2026-11-13: [`clubfindr/docs/section4-inventory.md`](clubfindr/docs/section4-inventory.md)
      (no SQL injection found; 34 of 72 input-reading endpoints validate nothing; several queries
      cannot work, e.g. the mobile QR code routes; a suggested order). KNOWN_ISSUES 51-57 are the
      security findings. The critical part was done 2026-11-13 (items below and KNOWN_ISSUES 57);
      what remains is the endpoint-by-endpoint validation rollout (34 endpoints with none), the
      SQL source guard and the request-body logging, planned as their own session. Decided
      2026-11-14: hand-written guards in `$lib/server/validate.ts`, no validation library.
      2026-11-14: the helper is in (`dda3f13`) and the 16 auth and account endpoints use it
      (`64223aa`, `96c1970`; `tests/input-validation.spec.ts`), each answering bad input with a
      400 in the shape its clients already read, worded for people where a page or the app shows
      it (`c7bf6ec`), and control characters refused (KNOWN_ISSUES 64). The request-body and
      e-mail logging is gone and the SQL source guard is in, both enforced by source tests
      (`e362d29`, `bdd4952`). Left: the inventory's write and read/search groups
      (`section4-inventory.md`, section 4)
- [x] Promoter auth was a forgeable plain cookie (KNOWN_ISSUES 51), the same flaw the venue
      guard had: fixed 2026-11-14 (`00c8e3e`) with a `user_sessions` session (no new table) in the
      encrypted httpOnly cookie, checked against `users.is_promoter`. Two promoter bugs came out
      of its test: a registered promoter's login answered 500 and dashboard events had no
      `event_id`, both fixed (KNOWN_ISSUES 62, 63, with a backfill migration for the old events);
      registration wrote no `promoters` row, so such a promoter could not create events, fixed
      with a backfill migration too (KNOWN_ISSUES 61)
- [ ] **Next:** the validation rollout to the write and read/search endpoints
      (`section4-inventory.md`, section 4). Done 2026-11-14 on the way: KNOWN_ISSUES 40, 54
      (nginx applied 2026-11-16), 59 and 60
- [x] Every venue write guard (`canManageBar`) accepted a plain, forgeable `barId` cookie, and
      `/api/bars/[barId]` had its check switched off: fixed 2026-11-13 with a real venue session in
      an encrypted httpOnly cookie (`edb066d`, KNOWN_ISSUES 52)
- [x] `/login/bars` re-sent every cookie without `HttpOnly`/`Secure`, fixed 2026-11-13
      (KNOWN_ISSUES 53)
- [x] Unauthenticated writes (`/api/mobile/checkin`, `/api/save-cookie-consent`), dead and debug
      routes, and the queries that could not run (QR codes, promoter resend, `/update-info` e-mail
      change), fixed 2026-11-13 (KNOWN_ISSUES 57)
- [x] Wildcard CORS on all of `/api/*` (KNOWN_ISSUES 54): fixed 2026-11-14 (`6973e8f`), only
      `https://clubfindr.com`, `https://www.clubfindr.com`, the deployment's own `ORIGIN` and
      localhost under `vite dev`. The live nginx site lost its CORS blocks on 2026-11-16 (backup
      `~/backups/sveltekit.config.20261116-093050` on the server); checked live: a foreign origin
      gets no CORS headers, both site origins exactly one, preflights 204
- [x] Confirmation-code attempts were limited only in the browser (KNOWN_ISSUES 55): fixed
      2026-11-14, counted in the database (`confirmation_attempts` on `bars` and `users`), five
      guesses per issued code across every confirm endpoint, then 429 until a new code
- [x] `POST /api/mobile/signup/complete` changed any user without authentication: deleted
      2026-11-13 (KNOWN_ISSUES 56)
- [x] Reduce request logging in `hooks.server.ts` (KNOWN_ISSUES 12), done 2026-11-12

## 5. Mobile app (`app_clubfindr`)

- [x] Done 2026-11-16 (KNOWN_ISSUES 67, 79). **Found on the first device run:** the city follows the account, not the person
      (KNOWN_ISSUES 67). Propose it from the device location (nearest covered city), add a city
      picker in the app's Profile and on the web, save it to `users.city`. Until then a wrong city
      can only be fixed in the database
- [x] Done 2026-11-16. App login screen (KNOWN_ISSUES 69): typed text is white on white on some phones, the e-mail
      field leaves autocorrect on, and the app's venue login accepts fewer accounts than the web's
- [x] Done 2026-11-16, live with the web deploy. Venue password reset (KNOWN_ISSUES 68): "Forgot Password?" on the venue login only resets
      `users` passwords, never a venue's own (`bars.password_hash`)
- [x] Done 2026-11-16 (`ab312d6`); distance sorting is on tonight's checklist. **Deadline 27 January 2027:** coarse location only (KNOWN_ISSUES 65). Drop
      `ACCESS_FINE_LOCATION` from `app.json` and request approximate location, so Play's new
      location policy needs no declaration; check venue distance sorting still reads right on a
      device
- [x] Done 2026-11-16, checked on a merged manifest (KNOWN_ISSUES 76); `expo-notifications`' own are left (77). Trim the Android permissions to what the app uses (KNOWN_ISSUES 65): `RECORD_AUDIO`,
      `SYSTEM_ALERT_WINDOW`, the external-storage pair and the three Bluetooth ones, through the
      config plugins' options or `android.blockedPermissions`; verify with `aapt2 dump
      permissions` on a fresh build. Bluetooth overlaps the iOS owner decision below
      (KNOWN_ISSUES 48)
- [x] Done 2026-11-17 (`4ac6131`, `2192782`): the venue's Music tab, Genres part. A "genres you
      play" editor on the bar dashboard, against
      `PUT /api/venues/:barId/taste/genres` (the endpoint takes the app's session token
      already; the web dashboard has the section since 2026-11-12)
- [ ] Unit tests for the services layer (started 2026-11-16: auth/bar login, city, the HTTP clients, location, logging; 25 tests → 97)
- [x] Done 2026-11-16 for the services and the HTTP clients (`b6d6bb0`) and for logging (`5ee2f8c`); and for the screens on 2026-11-17 (lint step 10, no `any` left). Replace `any` types and gate `console.log` for production builds
- [ ] Split screen components over 500 lines (LoginScreen done 2026-11-16; EventFormScreen and BarHomeScreen 2026-11-17; the customer-side rest are listed in KNOWN_ISSUES 80)
- [ ] **Next server round:** expand recurring venue events into dates on the server (KNOWN_ISSUES
      90). Today a recurring event counts for matching on its first date only, and then drops out
      of `/barfindr` and the venue's own list. One occurrence function in `$lib` for the venue
      list, both matchers and `/barfindr`; validate `recurrence_pattern` against daily, weekly,
      biweekly and monthly; the app's Events tab then lists occurrences. With its e2e run
- [ ] **Next server round, decided 2026-11-17: "live music" is a filter, not a genre.** Today a
      venue can only say it as a free-text event genre ("Live Music", "Acoustic"), which the
      matcher cannot place. Instead: an event attribute (live music or not; maybe a small set of
      formats such as live, DJ, karaoke) next to its genres, set with a switch in the app's and the
      web's event form; a filter on the customer side, live music first, with the genres
      underneath ("live music, and of that, jazz"); existing "live music" tags moved into the
      attribute by a migration. Goes with the strict event genres (KNOWN_ISSUES 90's round)
- [ ] Then cancel one date of a recurring venue event instead of deleting the series (KNOWN_ISSUES
      89): a skipped-dates table read by the occurrence function, and a choice in the app's and
      the web's delete
- [ ] Loading states and network error recovery (Home and Tilki have an error with "Try again" since 2026-11-16, KNOWN_ISSUES 72)
- [ ] Finish the QR scanner flow to open venue details
- [ ] Configure Sentry for production with source maps
- [ ] Turn on R8 for Android release builds and give Play the mapping file. Play warns on every
      upload (first seen on versionCode 9, 2026-11-16): "no deobfuscation file associated with this
      App Bundle". React Native release builds do not run R8 by default; enabling it (and resource
      shrinking) through `expo-build-properties` (`android.enableMinifyInReleaseBuilds`,
      `enableShrinkResourcesInReleaseBuilds`) makes the app smaller, which serves the February 2027
      size requirement, and produces `mapping.txt` to upload with each bundle so Play can decode
      crash and ANR stack traces. A local EAS build leaves it in its temporary build folder, so
      copy it out before it is cleaned up. Needs a device run: R8 can strip classes that native
      modules reach by reflection, which then crash only in release builds. Pairs with Sentry for
      the JavaScript side

### iPhone / App Store

The app has never been built for iOS. **No Mac is needed to ship it**: EAS builds iOS in Expo's
cloud (`EAS_NO_VCS=1 eas build --platform ios`), TestFlight installs test builds on an iPhone, and
`eas submit` uploads to App Store Connect. A Mac only adds the iOS simulator and Xcode debugging.
Checked 2026-11-16: no Google/Facebook sign-in in the app, so Sign in with Apple is not required;
the in-app account deletion Apple requires exists (`DeleteAccountScreen`).

- [ ] Owner: Apple Developer Program membership ($99/year), then the app record in App Store
      Connect for bundle id `com.clubfindr.mobile`; EAS then creates the iOS signing certificate
      and provisioning profile on the first build
- [x] Done 2026-11-16 (`ab312d6`). Camera permission text, or the QR scanner crashes on iOS (KNOWN_ISSUES 66): add the
      `expo-camera` config plugin with a camera message and the microphone off
- [x] Done 2026-11-16, checked on a prebuilt Info.plist: `expo-location`'s plugin had been putting the "Always" texts back (KNOWN_ISSUES 76). `app.json` `ios.infoPlist`: drop `NSLocationAlwaysUsageDescription` (the app only needs
      location while in use, and "Always" draws review questions) and the two Bluetooth strings
      "for Spotify integration" (KNOWN_ISSUES 48, nothing uses Bluetooth); App Review rejects
      permission texts that do not match what the app does
- [x] Done 2026-11-16 (`b61fcd7`). `supportsTablet` is `true`. **Decided 2026-11-16: iPhone only, set it to `false`** (no iPad
      screenshots or iPad layout review; today's session, step 4)
- [x] Done 2026-11-16 (`b61fcd7`): `appVersionSource: "local"` (versions live in `app.json`), device builds, no auto-increment; an ad-hoc internal profile waits for the Apple account. `eas.json`: iOS settings for the `preview` (internal distribution or TestFlight) and
      `release` profiles, and `cli.appVersionSource` (EAS already warns it will become required)
      so iOS build numbers are managed
- [ ] Privacy: the App Privacy answers in App Store Connect, the iOS privacy manifest
      (`ios.privacyManifests` for the required-reason APIs the libraries use), and a Privacy
      Policy that no longer names Spotify (KNOWN_ISSUES 47)
- [ ] First TestFlight build on an iPhone: safe areas and the notch, keyboard over the forms,
      location and camera prompts, the QR scan and share sheet, sign-up and the artist step
- [ ] Sentry on iOS with the JavaScript source maps (the section 5 Sentry item)

## 6. Data pipeline (`data_collection`)

- [ ] Replace pickle files with JSON
- [ ] Retry with backoff and checkpointing so a failed run can resume
- [ ] Move hardcoded paths and cities into configuration
- [ ] Remove `oldScripts/` and other unused scripts
- [ ] Clear the `bandit` findings in `data_collection` (KNOWN_ISSUES 46): timeouts on every
      `requests` call first (a hung scrape holds the run lock), `# nosec` with a reason on the
      false-positive B608s, then make the CI security scan a failing step
- [ ] Tests for the scraping and enrichment steps

## 7. `barfindr` scaling

Closed 2026-11-12: section 1 superseded it — the venue Spotify playback polling was retired
outright, so there is nothing left to scale. Winding barfindr down is the optional last step
of [`deploy/TEARDOWN-spotify-service.md`](deploy/TEARDOWN-spotify-service.md), once
`bar_genre_profiles` and `bar_genre_aggregates` are empty; it then needs a repo change to drop
its units from `deploy/deploy.sh` and the sudoers file. (Both items had in fact already been done while
the polling lived: it dispatched venues in chunked Celery batches, and the 24-hour aggregation
ran in SQL.) `barfindr` now runs only the aggregate-refresh and cleanup tasks, which drain the
polled tables. `spotify_service` itself was retired on 2026-11-13 (section 1).

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
