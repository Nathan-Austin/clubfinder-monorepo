# Device checklist: Android build of versionCode 12

For the next build from this branch, from Play internal testing. Bump `versionCode` (11 → 12) with
`npm run build:android` or `scripts/bump-version.js`; nothing in the session touched it. Build with
`EAS_NO_VCS=1` as `CLAUDE.md` says. The versionCode 11 run (2026-11-18) is in git (`e57abaa`);
everything it failed, plus what this round fixed, is below.

**Deploy the web side first.** Sign-up straight in, venue deletion and the city proposal need the
server from this branch; against the old server the app falls back to the old "You can now log in"
flow, and the venue delete reports a plain failure. Mark each item `[x]`, or write **FAIL** /
**Issue** / **Not tested** with what you saw, the screen and the message.

Have to hand: a venue login, a second phone or screen for a QR code, a customer login, a **test
venue you can destroy** (section 5), and ideally a **small phone** (carried over from v11).

## 0. Before installing
- [ ] `aapt2 dump permissions <apk>`: the same list as versionCode 11 (nothing this round changes
      a permission or adds a native module).

## 1. QR sharing (the v11 FAIL: `qrId.replace is not a function`)
Log in as the venue, Venue tab → QR codes.
- [ ] Create a code, **Share** it: "Preparing your QR code…" with Cancel, then the share sheet
      with a PNG. Send it to yourself and check the image shows the code and title.
- [ ] Share again, press **Cancel** while it prepares: the card closes, no share sheet later.
      (Blocked in v11 by the share FAIL.)
- [ ] Share again, press Android's **back** while it prepares: same as Cancel. (Blocked in v11.)
- [ ] If sharing never gets past the spinner: note it; Cancel must still close it
      (fallback is `react-native-view-shot`, KNOWN_ISSUES 87).
- [ ] Share a code, then **scan the shared PNG** from the other screen with the customer login:
      check-in success (the PNG, not just the on-screen code).

## 2. Bar Registration: international phone numbers (v11 issue)
Log out → Bar Manager → Register.
- [ ] Step 2 accepts a **+49 German mobile** (13 digits, e.g. +49 151 23456789) and reaches
      step 3 (City). No need to finish the registration.
- [ ] A 6-digit number still shows "Please enter a valid phone number (7 to 15 digits)".

## 3. The network banner (v11 issue, dated from January)
- [ ] Airplane mode on: the red "Offline" banner appears.
- [ ] Airplane mode off: the banner **goes away** (no green "WiFi" strip staying on every screen).
- [ ] Repeat once: on → banner, off → gone again. No app restart needed.

## 4. Sign-up: straight in after verifying (owner's request, 2026-11-18)
Use a fresh e-mail address.
- [ ] Sign up, enter the e-mailed code: the app goes **straight into the artist picker**, signed
      in — no "You can now log in", no login screen.
- [ ] Kill and reopen the app: still signed in.
- [ ] **City proposal:** the new account has no city now (no Berlin default). The app proposes
      the nearest covered city ("You seem to be in …. Switch?"); accept it, and check Profile
      shows it. Discover/Tilki work from it.
- [ ] A wrong code still shows the error and does not sign in.

## 5. Venue account deletion (new; Play's account-deletion policy)
**On a venue you can destroy** (register a fresh one in the app if needed).
- [ ] Venue tab → **Delete venue account** (below Log out): first alert names the venue and what
      goes; Cancel keeps everything.
- [ ] Again → Continue → "Are you sure?" → **Delete for ever**: "Venue deleted", then the login
      screen.
- [ ] The venue login no longer works (its e-mail/password are refused).
- [ ] The web dashboard `/bars` for that venue is gone too (login refused on the web).
- [ ] Customer check-in history at other venues is untouched.

## 6. Web, same branch (owner, in the browser)
- [ ] `/users-home`: "Current City" shows the account's saved city (not "Detecting your
      location…"); **Find events** → `/clubs` runs on that city and names it in the heading —
      also when there are no events that day ("There are no events in … yet"), not
      "Unknown City".
- [ ] `/update-info`: the city picker and inputs are readable (dark select, visible Save button;
      the whole page had white-on-white inputs).
- [ ] `/bars` (a venue you can destroy): "Delete this venue" asks for the venue's name typed,
      deletes, and lands on `/`; logging in again is refused.

## 7. Genres: one list (KNOWN_ISSUES 91)
- [ ] Music tab → Genres: type "hou" → **House** itself is suggested now (it never was), and
      saving it is accepted. Same for "rock" and "hip hop".
- [ ] Event form → Genres: the suggestions are the same list. Add a made-up genre
      ("polka-step") and save: the server refuses it by name ("Not genres Clubfindr knows:
      polka-step") and the event is not saved. Remove it and the save goes through.
- [ ] Web `/bars` → add or edit an event: the quick-pick grid no longer offers "Live Music" or
      "Acoustic" (the matcher refuses both; live music becomes its own attribute later), and
      typing in "Add another genre" suggests from the shared list.

## 8. Recurring events as dates (KNOWN_ISSUES 90)
- [ ] Events tab: a **weekly** event created with a date in the past (or a few weeks ago) is
      listed on its **upcoming dates**, not gone — several cards of the same night, each with its
      own date and the Weekly badge, up to two months ahead.
- [ ] The form's note under Recurrence now reads "Every date is listed and matched, for the next
      two months".
- [ ] Editing one of those cards edits the series (the same event opens whichever date you tap);
      deleting removes the whole series — expected until "cancel this date" exists
      (KNOWN_ISSUES 89). Note anything confusing.
- [ ] A one-off far in the future (say next summer) is still listed.
- [ ] Tilki/Discover on a date the weekly night falls on: the venue shows up with that night's
      genres; on the day after, it does not.

## 9. Live music, and cancelling one date
- [ ] Event form: the **Live music** switch ("A band or a live act, not only a DJ"). Save with it
      on: the Events list shows a green **Live music** badge, and editing keeps it on.
- [ ] "Live Music" as a *genre* is still refused ("Not genres Clubfindr knows: live music") —
      that is what the switch is for.
- [ ] Tilki → Bars: the **Live music only** chip. On: only venues with a live night that day;
      off: all of them again. The order still follows your taste.
- [ ] Web `/barfindr`: the same "Live music only" filter under the date.
- [ ] Events tab, a repeating night: delete asks **"This date only"** or **"Every date"**.
      This date only → that card goes, the other dates stay, and the venue does not show up for
      that night in Tilki. Every date → the whole series goes.
- [ ] A one-off event still deletes with the plain "Delete event?" question.

## 10. Carried over, still untested from v11
- [ ] The four venue tabs on a **small phone**: all labels readable.
- [ ] Edit an older event that has "Live Music": the chip is still there in the list, but the
      save now refuses it ("Not genres Clubfindr knows: live music") — expected until live music
      becomes an event attribute (ROADMAP section 5). Note what you saw.

## Report back
For anything that fails: the section, what you did, the message shown, and the phone (small or
not, light or dark system mode).
