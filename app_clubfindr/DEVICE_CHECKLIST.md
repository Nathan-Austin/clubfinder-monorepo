# Device checklist: Android build of 2026-11-17 evening

For the build from this branch, from Play internal testing. Bump `versionCode` (10 → 11) with
`npm run build:android` or `scripts/bump-version.js`; nothing in the session touched it. Build with
`EAS_NO_VCS=1` as `CLAUDE.md` says. Last night's run (versionCode 10, 27 passed) is in KNOWN_ISSUES
81-86 and in git (`60154ed`); everything it failed or left untested is below.

**Everything today is app-only.** No server change, no deploy needed: the app talks to production
(`https://www.clubfindr.com`) as it is. Mark each item `[x]`, or write **FAIL** / **Issue** /
**Not tested** with what you saw, the screen and the message.

Have to hand: a venue login, a **second phone or screen** to show a QR code on, a customer login,
and ideally a **small phone** (section 2) and a personal account that has **no venue** (section 10).

## 0. Before installing
- [x] `aapt2 dump permissions <apk>`: the same list as last night (nothing today changes a
      permission or adds a native module): `ACCESS_COARSE_LOCATION`, `ACCESS_NETWORK_STATE`,
      `ACCESS_WIFI_STATE`, `CAMERA`, `FOREGROUND_SERVICE`, `INTERNET`, `POST_NOTIFICATIONS`,
      `READ_APP_BADGE`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `WAKE_LOCK`, plus the
      `expo-notifications` ones (KNOWN_ISSUES 77).

## 1. Login messages (KNOWN_ISSUES 81, failed last night)
- [x] Customer mode, right e-mail, **wrong password**: "Email or password incorrect. Please try
      again." (not "Could not log in. Please check your credentials…").
- [x] Customer mode, an e-mail with no account: the same "incorrect" message.
- [x] Bar Manager mode, wrong password: the same "incorrect" message.
- [x] Airplane mode, then log in: "Network error. Please check your internet connection…".
- [x] Right password, customer and venue: both still log in.

## 2. Venue side: the new tabs (KNOWN_ISSUES 86, Issue last night)
Log in as the venue.
- [x] Four tabs at the bottom: **Overview, Events, Music, Venue**. All four labels readable, nothing
      cut off. **On a small phone too** if you have one.
      Emulator (640x1428, 427 dp wide): pass. **Small phone: Not tested.**
- [x] No row of buttons across the top any more.
- [x] Every venue screen is dark with light text: no white-on-white, no grey background showing
      through (the app has one dark theme now).

## 3. Overview tab
- [x] Header: the venue's name, "Tonight at a glance".
- [x] Two tiles: Today's Visitors, This Week. **No "Genre Matches"** tile (it was always 0).
- [x] **Next event** card shows the soonest upcoming event with its day and times. Tap → the
      Events tab.
- [x] With no upcoming events: "Nothing planned yet. Tap to add an event." Tap → Create Event.
      Tested on a new venue ("New test bar", registered during this run).
- [x] **Check-in code** card. Tap → QR Codes opens over the tabs; back returns to Overview.
- [x] Pull down to refresh: the numbers and the next event reload.

## 4. Events tab (KNOWN_ISSUES 82, failed last night)
- [x] The venue's upcoming events, soonest first, each with edit and delete icons.
- [x] **Add event** → the form opens over the tabs. Create one: back on Events, it's in the list
      without a manual refresh. Overview's Next event updates too.
- [x] Edit it: change the name, save → the list shows the new name.
- [x] **Delete** it: "Delete event?" names the event and its day → Cancel keeps it; Delete removes
      it (a spinner on that card while it runs).
- [x] Airplane mode, open Events (or pull to refresh): "We couldn't load your events just now."
      with Try again, not "No upcoming events". Airplane off, Try again → the list.

## 5. The event form (steps 8-9)
- [x] Date, Start Time and End Time pickers open and set the values; the times can be switched off.
- [x] End 21:00 after start 22:00 → "End time must be after start time". End 04:00 after start 22:00
      is accepted (next morning).
- [x] Empty name → "Event theme/name is required".
- [x] **Recurring Event** on → the pattern (Daily, Weekly, Bi-weekly, Monthly) and the note
      "Currently listed and matched on the first date only; repeating dates are coming soon."
- [x] **Genres**: type "tech" → suggestions (Tech House, Tech Trance, …, Techno); tap one → a chip.
      Typed text such as "jazz funk" can be added with Add. The same genre twice (any case) is not
      added. ✕ removes a chip. The old grid of 18 buttons is gone.
- [ ] Edit an older event that has "Live Music": the chip is still there after saving.
      **Not tested**: the reviewer venue has no event with "Live Music" (its demo night has techno
      and house).
- [x] Recurring events on the Events list carry a badge (Weekly, Every two weeks, …). Known: they
      disappear after their first date (KNOWN_ISSUES 90, next server round).

## 6. Music tab (step 7, new)
- [x] Two parts, **Artists | Genres**. Artists is the artist picker as before; its genre list is
      titled "Genres from your artists".
- [x] **Genres**: "Genres you play", with the venue's genres as chips (the same ones the web
      dashboard `/bars` shows under "Genres you play").
- [x] Add one from a suggestion → it saves at once (leave the tab and come back: still there).
- [x] Add a made-up genre ("polka-step") → the server's refusal "Not genres Clubfindr knows:
      polka-step" shows, and the list stays as it was.
- [x] Remove one → gone, also on the web dashboard after a reload.
- [x] Shows "N of 15"; at 15 the field stops taking more.

## 7. Venue tab
- [x] The venue's name, then **Edit venue profile**, **QR codes**, **Log out**.
- [x] Edit venue profile: change the **name**, save → back on Venue, the new name shows at once;
      Overview's header too, **without logging out** (one shared venue context now).
- [x] QR codes opens over the tabs.
- [x] Log out → confirmation → the login screen.

## 8. QR codes (KNOWN_ISSUES 83 and 85, failed last night)
- [x] The screen is readable: dark background, white text; only the QR codes themselves sit on white.
- [ ] Create a code. Then **Share** it: "Preparing your QR code…" with a Cancel button, then the
      share sheet with a PNG. Send it to yourself (or open it in Photos) and check the image.
      **FAIL** (2026-11-18, emulator): "Error: Could not share the QR code. Please try again."; the
      log says `TypeError: qrId.replace is not a function`. The server sends a code's `id` as a
      number (`bar_qr_codes.id` is a serial), the app types it as a string
      (`QRCodeData.id` in `QRCodeGeneratorScreen`), and `qrShareFilePath` calls `.replace` on it.
      Every share fails before the PNG is written; the unit test only passes a string id.
- [ ] Share again, and press **Cancel** while it prepares: the card closes, no share sheet appears
      later.
      **Blocked** by the share FAIL above: the error comes before the preparing step.
- [ ] Share again, and press Android's **back** button while it prepares: same as Cancel.
      **Blocked** by the share FAIL above: the error comes before the preparing step.
- [ ] If sharing still never gets past the spinner: note it, Cancel must still close it
      (fallback in KNOWN_ISSUES 87).
      **Blocked** by the share FAIL above: the error comes before the preparing step.
- [x] Delete a code; delete one that has been scanned.

## 9. Check-in by scanning (KNOWN_ISSUES 84, failed last night)
Customer login on the phone; the venue's code on the second screen, full size.
- [x] Profile → Scan QR Code. **A code from the list** (shared in section 8, or shown from the QR
      screen) → check-in success with the venue's name. This is the one that was refused before.
- [x] A code you **just created** → success too.
- [x] **Any non-Tilki code** (a website, a Wi-Fi code) → "Not a Tilki code", once. Keep it in front
      of the camera: no second alert until you press OK. No crash. (Not tested last night.)
- [x] A code you **deleted** in section 8 → "Code not recognised".

## 10. Not tested last night
- [x] A **personal account with no venue**, Bar Manager mode → "No venue is linked to this
      account. Register your venue first."
- [x] **Venue password reset by e-mail**: Bar Manager mode → Forgot password? → the venue e-mail →
      the mail arrives → set a new password → the new one logs in, the old one does not.
- [ ] **Web**: `/update-info` → Your city → change it → `/clubs` uses the new city.
      **FAIL** (2026-11-18, checked in the browser together): Amsterdam saved and stays saved
      (`/update-info`'s select holds "Amsterdam"), but `/users-home` says "Detecting your
      location…" → **Berlin** and never reads `users.city`; `/` does the same. A search from
      either posts the guessed city to `/storestate`, which overwrites the `city` cookie, so
      `/clubs` is back on the location's city after one search. The saved city only lasts until
      then. See the issues below for the white picker and "Unknown City".
- [x] Profile (customer) has no "Push Notifications" switch.
- [ ] Discover, Search and Tilki: a genre search still returns venues.
      **Issue (data, not the app)**: bars come back (5 per search), **clubs never do**: Tilki →
      Clubs (taste drone, ambient) and a "techno" search get 0 events for every day of
      2026-11-23..29. Scraping has been off since Aug 2025 (`deploy/cron/clubfinder.crontab`, the
      event fetcher is broken), so production has no upcoming scraped events; `/clubs` on the web
      shows "Unknown City" for the same reason. The app's requests and handling are fine.
- [x] Onboarding artist picker after a **fresh signup**. After verification the app goes back to
      the login screen ("You can now log in"); the picker comes at the first login. Owner's
      request: go straight in after verifying (ROADMAP).
- [x] Bar Registration → City: the nine covered cities (London, Berlin, Amsterdam, Rotterdam,
      Barcelona, Ibiza, Madrid, Paris, Stockholm); no Rome or New York.

## 11. The rest of the app looks as before (lint step 10)
Every style colour moved onto the shared palette, at exactly the same values, and debug logging
moved to the gated logger. Nothing should look different; a quick look at each:
- [x] Customer tabs: Home, Discover, Search, Tilki, Profile (icons as before, active tab orange).
- [x] Venue details (tap a venue), Login, Signup, Delete Account, Terms, Privacy Policy, Email
      verification, Bar Registration and Confirmation.
- [x] Home in airplane mode still shows "We couldn't load venues just now" with Try again.

## Found during the 2026-11-18 run (emulator, dev build of v11)
- **Issue: the network banner never goes away after coming back online.** Airplane mode on → the
  red "Offline" banner; airplane mode off → it turns into a green "WiFi" strip across the top of
  every screen and stays. Cause: `src/components/NetworkStatus.tsx` registers
  `handleNetworkChange` once (`useEffect(..., [])`), so it compares against the first render's
  `isVisible` (false) for ever and never hides the banner. Not from this round: the logic dates
  from `76e1404` (January); the 2026-11-17 commits only changed its imports and colours.
  Restarting the app clears it.
- **Issue: plain "House" is never suggested.** Music → Genres, type "hou": the suggestions are
  Acid House, Afro House, Afro-Latin House, … (8 shown), never "House". The vocabulary
  (`utils/genreVocabulary`, from the web's `static/lib/unified-genres.json`) is sub-cluster names
  and leaf genres, and that file has no plain "House" (nor "Rock" or "Hip Hop"); its "Techno" and
  "Jazz" are there. The server's matcher does know "house" (`processed_genres.json`), so typing it
  and tapping Add saves it (checked: "house" typed + Add was accepted and kept). Same list as the
  web dashboard, so the web has the same gap.
- **Issue (usability): a venue reset can change the wrong password.** Bar Manager mode → Forgot
  password? with an e-mail that is both a personal account and a venue's own login: the mail has
  two links, the personal one first. Clicking it changes only the personal password, and the old
  venue password keeps working (the venue login accepts either), which looks like a failed reset.
  The venue link worked as designed. Started from the venue login (`?from=bars`), the venue link
  could come first or alone (`api/request-password-reset`).
- **Issue: `/update-info`'s city picker is white on white.** `CityPicker.svelte` uses
  `bg-gray-700`, `border-gray-600`, `bg-blue-500`/`hover:bg-blue-600`, `bg-green-600` and
  `bg-red-500`, none of which the `@theme` in `src/app.css` defines (it resets `--color-*` and
  keeps a short list), so no utility is generated: the select falls back to the base white
  background with `text-white`, the Save button and the saved/error message have no background.
- **Issue: `/clubs` says "Unknown City" when a city has no events.** The no-rows return in
  `clubs/+page.server.ts` (~line 230) and the error return omit `city` from `props`, and
  `clubs/+page.svelte` falls back to "Unknown City"; it should name the city and say there are
  no events that day.
- **Issue: Bar Registration refuses international phone numbers.** Step 2's check
  (`BarRegistrationScreen.tsx` ~line 107, `^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$`)
  is US-shaped and allows at most 12 digits: a German mobile with +49 (13 digits) gets "Please
  enter a valid phone number", and City (step 3) cannot be reached. The server accepts 7-15 digits
  (`barValidators.isValidTelephone`); the app should match it.

## Report back
For anything that fails: the section, what you did, the message shown, and the phone (small or not,
light or dark system mode).
