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
- [ ] `aapt2 dump permissions <apk>`: the same list as last night (nothing today changes a
      permission or adds a native module): `ACCESS_COARSE_LOCATION`, `ACCESS_NETWORK_STATE`,
      `ACCESS_WIFI_STATE`, `CAMERA`, `FOREGROUND_SERVICE`, `INTERNET`, `POST_NOTIFICATIONS`,
      `READ_APP_BADGE`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `WAKE_LOCK`, plus the
      `expo-notifications` ones (KNOWN_ISSUES 77).

## 1. Login messages (KNOWN_ISSUES 81, failed last night)
- [ ] Customer mode, right e-mail, **wrong password**: "Email or password incorrect. Please try
      again." (not "Could not log in. Please check your credentials…").
- [ ] Customer mode, an e-mail with no account: the same "incorrect" message.
- [ ] Bar Manager mode, wrong password: the same "incorrect" message.
- [ ] Airplane mode, then log in: "Network error. Please check your internet connection…".
- [ ] Right password, customer and venue: both still log in.

## 2. Venue side: the new tabs (KNOWN_ISSUES 86, Issue last night)
Log in as the venue.
- [ ] Four tabs at the bottom: **Overview, Events, Music, Venue**. All four labels readable, nothing
      cut off. **On a small phone too** if you have one.
- [ ] No row of buttons across the top any more.
- [ ] Every venue screen is dark with light text: no white-on-white, no grey background showing
      through (the app has one dark theme now).

## 3. Overview tab
- [ ] Header: the venue's name, "Tonight at a glance".
- [ ] Two tiles: Today's Visitors, This Week. **No "Genre Matches"** tile (it was always 0).
- [ ] **Next event** card shows the soonest upcoming event with its day and times. Tap → the
      Events tab.
- [ ] With no upcoming events: "Nothing planned yet. Tap to add an event." Tap → Create Event.
- [ ] **Check-in code** card. Tap → QR Codes opens over the tabs; back returns to Overview.
- [ ] Pull down to refresh: the numbers and the next event reload.

## 4. Events tab (KNOWN_ISSUES 82, failed last night)
- [ ] The venue's upcoming events, soonest first, each with edit and delete icons.
- [ ] **Add event** → the form opens over the tabs. Create one: back on Events, it's in the list
      without a manual refresh. Overview's Next event updates too.
- [ ] Edit it: change the name, save → the list shows the new name.
- [ ] **Delete** it: "Delete event?" names the event and its day → Cancel keeps it; Delete removes
      it (a spinner on that card while it runs).
- [ ] Airplane mode, open Events (or pull to refresh): "We couldn't load your events just now."
      with Try again, not "No upcoming events". Airplane off, Try again → the list.

## 5. The event form (steps 8-9)
- [ ] Date, Start Time and End Time pickers open and set the values; the times can be switched off.
- [ ] End 21:00 after start 22:00 → "End time must be after start time". End 04:00 after start 22:00
      is accepted (next morning).
- [ ] Empty name → "Event theme/name is required".
- [ ] **Recurring Event** on → the pattern (Daily, Weekly, Bi-weekly, Monthly) and the note
      "Currently listed and matched on the first date only; repeating dates are coming soon."
- [ ] **Genres**: type "tech" → suggestions (Tech House, Tech Trance, …, Techno); tap one → a chip.
      Typed text such as "jazz funk" can be added with Add. The same genre twice (any case) is not
      added. ✕ removes a chip. The old grid of 18 buttons is gone.
- [ ] Edit an older event that has "Live Music": the chip is still there after saving.
- [ ] Recurring events on the Events list carry a badge (Weekly, Every two weeks, …). Known: they
      disappear after their first date (KNOWN_ISSUES 90, next server round).

## 6. Music tab (step 7, new)
- [ ] Two parts, **Artists | Genres**. Artists is the artist picker as before; its genre list is
      titled "Genres from your artists".
- [ ] **Genres**: "Genres you play", with the venue's genres as chips (the same ones the web
      dashboard `/bars` shows under "Genres you play").
- [ ] Add one from a suggestion → it saves at once (leave the tab and come back: still there).
- [ ] Add a made-up genre ("polka-step") → the server's refusal "Not genres Clubfindr knows:
      polka-step" shows, and the list stays as it was.
- [ ] Remove one → gone, also on the web dashboard after a reload.
- [ ] Shows "N of 15"; at 15 the field stops taking more.

## 7. Venue tab
- [ ] The venue's name, then **Edit venue profile**, **QR codes**, **Log out**.
- [ ] Edit venue profile: change the **name**, save → back on Venue, the new name shows at once;
      Overview's header too, **without logging out** (one shared venue context now).
- [ ] QR codes opens over the tabs.
- [ ] Log out → confirmation → the login screen.

## 8. QR codes (KNOWN_ISSUES 83 and 85, failed last night)
- [ ] The screen is readable: dark background, white text; only the QR codes themselves sit on white.
- [ ] Create a code. Then **Share** it: "Preparing your QR code…" with a Cancel button, then the
      share sheet with a PNG. Send it to yourself (or open it in Photos) and check the image.
- [ ] Share again, and press **Cancel** while it prepares: the card closes, no share sheet appears
      later.
- [ ] Share again, and press Android's **back** button while it prepares: same as Cancel.
- [ ] If sharing still never gets past the spinner: note it, Cancel must still close it
      (fallback in KNOWN_ISSUES 87).
- [ ] Delete a code; delete one that has been scanned.

## 9. Check-in by scanning (KNOWN_ISSUES 84, failed last night)
Customer login on the phone; the venue's code on the second screen, full size.
- [ ] Profile → Scan QR Code. **A code from the list** (shared in section 8, or shown from the QR
      screen) → check-in success with the venue's name. This is the one that was refused before.
- [ ] A code you **just created** → success too.
- [ ] **Any non-Tilki code** (a website, a Wi-Fi code) → "Not a Tilki code", once. Keep it in front
      of the camera: no second alert until you press OK. No crash. (Not tested last night.)
- [ ] A code you **deleted** in section 8 → "Code not recognised".

## 10. Not tested last night
- [ ] A **personal account with no venue**, Bar Manager mode → "No venue is linked to this
      account. Register your venue first."
- [ ] **Venue password reset by e-mail**: Bar Manager mode → Forgot password? → the venue e-mail →
      the mail arrives → set a new password → the new one logs in, the old one does not.
- [ ] **Web**: `/update-info` → Your city → change it → `/clubs` uses the new city.
- [ ] Profile (customer) has no "Push Notifications" switch.
- [ ] Discover, Search and Tilki: a genre search still returns venues.
- [ ] Onboarding artist picker after a **fresh signup**.
- [ ] Bar Registration → City: the nine covered cities (London, Berlin, Amsterdam, Rotterdam,
      Barcelona, Ibiza, Madrid, Paris, Stockholm); no Rome or New York.

## 11. The rest of the app looks as before (lint step 10)
Every style colour moved onto the shared palette, at exactly the same values, and debug logging
moved to the gated logger. Nothing should look different; a quick look at each:
- [ ] Customer tabs: Home, Discover, Search, Tilki, Profile (icons as before, active tab orange).
- [ ] Venue details (tap a venue), Login, Signup, Delete Account, Terms, Privacy Policy, Email
      verification, Bar Registration and Confirmation.
- [ ] Home in airplane mode still shows "We couldn't load venues just now" with Try again.

## Report back
For anything that fails: the section, what you did, the message shown, and the phone (small or not,
light or dark system mode).
