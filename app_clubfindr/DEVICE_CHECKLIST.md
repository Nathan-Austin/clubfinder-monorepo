# Device checklist: versionCode 13 (2026-11-19 round)

One consolidated list for this round: everything built on 2026-11-19 after the versionCode 12
run (its notes are all answered here), plus what that run left untested. Web items first, since
most of the day's work is on the server; the app has three changes.

Mark each item `[x]`, or write **FAIL** / **Issue** / **Not tested** with what you saw, the screen
and the message.

## 0. Order of work — read first

1. **Deploy the web side first.** One new migration goes with it (`deploy.sh` applies it):
   `20261119_user_sessions_many_per_user.sql` — drops the one-session-per-account constraint on
   `user_sessions` and indexes `session_id` and `user_id`. Additive apart from the dropped
   constraint; no rows change. From then on an account can be logged in on the website and in
   the app at the same time (KNOWN_ISSUES 95).
2. **Then build the app**: bump `versionCode` to 13 in `app.json` yourself (the repo still says
   12), then `EAS_NO_VCS=1 eas build --platform android --profile release --local`.
3. **Data:** the 02:00 run now keeps only genres the matcher knows and refuses a Spotify match
   that does not fit its line-up (KNOWN_ISSUES 94). Nothing to do on a device; see section 7.

Have to hand: a customer login, a venue login, a second phone or screen for QR codes, a venue you
can destroy (section 8), a fresh e-mail address, and ideally a small phone. The web items want a
desktop browser and a phone-width browser.

## 1. Web: the 2026-11-19 fixes (browser, after the deploy)

- [ ] `/users-home`: one search block — the date once, then **Find clubs** and **Find bars**.
      Find bars → `/barfindr` for the account's city; Find clubs → `/clubs`. On a phone-width
      browser the two buttons wrap and stay readable.
- [ ] `/clubs`: every card's "Matching Genres" line says **"NN% match · M of T genres"** and lists
      only the genres you matched on (green, with a tick). **Show all T genres** opens that one
      card's whole list; the button then reads "Show matched only". A night with few matches
      reads as a low percentage.
- [ ] `/barfindr`: the **Live music only** chip is readable in both states (dark on white when
      off, white on green when on).
- [ ] `/register` (venue sign-up): **"Smoking allowed inside?"** is Yes / No, No preselected.
- [ ] `/bars` on a venue you can destroy (section 8): after **Delete this venue**, the header
      offers **Login**, not Log Out — also when you had logged in as a customer in the same
      browser beforehand.
- [ ] Password reset from `/login/bars` → Forgot Password: the mail puts **the venue's link
      first**; from `/login/users` the personal account's link is first.
- [ ] Password reset of a **personal** account: while logged in on the web *and* in the app,
      reset the password from the mail link → both are logged out (the app shows the login
      screen on its next request; the web header offers Login after a reload).
- [ ] **Two devices at once** (the migration): log in on the website, then in the app → the
      website is still logged in. Log out on one → the other stays.
- [ ] `/redirect?barId=x&qrId=1&type=checkin` (a venue QR code opened in the phone's camera, or
      typed): on an **Android phone without the app**, Google Play's page for
      `com.clubfindr.mobile` after two seconds; on an **iPhone**, the page stays with the note
      that the iPhone app is on its way; on a **desktop**, the page stays with the Play badge.
      With the app installed, the app opens and the browser does **not** go on to Play.

## 2. App: sign-up code message (v12 note)

- [ ] Sign up with a fresh address, enter a **wrong code**: the message is "Invalid confirmation
      code" (or "Confirmation code has expired"), never "HTTP error 400".
- [ ] Five wrong codes: the attempts message, then a new code is needed.
- [ ] The right code: straight into the artist picker, as before.

## 3. App: unknown genres, inline (v12 note)

Venue login → Events → add or edit an event.

- [ ] Type a made-up genre ("polka-step"): before adding, the line **No genre called
      "polka-step"…** shows under the field. Add it anyway → an **amber chip with a question
      mark**, a line beneath saying it is not a genre Clubfindr knows, and the **Save button is
      greyed out**.
- [ ] Remove the amber chip → Save is live again; the event saves.
- [ ] Music tab → Genres: the same amber marker on an unknown name (the server refuses it as
      before; the marker is the explanation).
- [ ] An old event still carrying **"Live Music" as a genre**: on edit it shows amber and must be
      removed before saving (live music is the switch now).

## 4. App: venue card dates (KNOWN_ISSUES 80)

Customer login, Tilki → Bars or Discover, a venue with events.

- [ ] A venue with an event **today** says "1 Event Today" (or "N Events Today"); one with its
      next event **tomorrow** says "Next Event: Tomorrow"; further out, the weekday or "Dec 4".
- [ ] If you can set the emulator to a west-of-UTC zone (e.g. America/Los_Angeles) in the
      evening: the badges still name the right day (they used to be a day early).

## 5. Carried over, still untested from versionCode 11 and 12

- [ ] Venue tab → QR codes → Share: scan the **shared PNG** from the other screen with the
      customer login → check-in success.
- [ ] After deleting a venue (section 8): your customer **check-ins at other venues** are
      untouched.
- [ ] The four venue tabs on a **small phone**: all labels readable.
- [ ] Nothing else in the app looks different (customer tabs, venue details, login, signup).

## 6. App: quick regression pass (the v12 fixes, one glance each)

- [ ] QR share works (Share → share sheet with a PNG; Cancel closes the card).
- [ ] Network banner: airplane mode on → Offline; off → gone.
- [ ] Event form: Live music switch, weekly series listed as dates, "This date only" / "Every
      date" on delete.

## 7. Data, after the next 02:00 run (server instance, not a device)

- [ ] `data_collection/logs/`: lines from the `lineUpFit` logger. Each is a Spotify match refused
      because its genres share no top-level cluster with the rest of its line-up. Read them for a
      week: a DJ sharing a name with a punk band is the case it exists for; a real eclectic act
      refused is the case to report.
- [ ] Events whose genre list contains `none`, `coco` or other names the web pickers do not
      offer should become rarer as artists come round (the 14-day cooldown); no re-clean by hand
      (owner's decision 2026-11-19).
- [ ] The printed "Artist selection for <city>" summary still shows upcoming artists first
      (KNOWN_ISSUES 92).

## 8. App and web: venue account deletion — do this last

**On a venue you can destroy** (register a fresh one in the app if needed).

- [ ] App: Venue tab → Delete venue account → Continue → Delete for ever → "Venue deleted", then
      the login screen; the venue login is refused afterwards, in the app and on the web.
- [ ] Web: `/bars` → Delete this venue (section 1's header check).

## Report back

For anything that fails: the section, what you did, the message shown, and the phone (small or
not, light or dark system mode). For section 1's two-device item, which device was logged out.
