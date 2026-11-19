# Device checklist: versionCode 12 (2026-11-19 round)

One consolidated list for this round. It covers everything built since the versionCode 11 device
run (2026-11-18): the three app FAILs from that run, venue account deletion, the city work, one
genre list with strict event genres, recurring events as dates, live music as an attribute and a
filter, and cancelling one date of a series.

Mark each item `[x]`, or write **FAIL** / **Issue** / **Not tested** with what you saw, the screen
and the message.

## 0. Order of work — read first

1. **Deploy the web side before building the app.** Four of the app's features talk to endpoints
   that only exist after the deploy (sign-up straight in, venue deletion, live music, cancelling
   one date). Against the old server the app falls back or reports a plain failure.
2. **Two new migrations go with that deploy** (`deploy.sh` applies them itself):
   - `20261119_bar_events_live_music.sql` — adds `bar_events.live_music` **and moves data**: the
     old `live music` / `live-music` / `livemusic` / `live` / `acoustic` genre tags become the
     attribute and leave `special_genres`. Idempotent; only rows carrying those tags change.
   - `20261119_bar_event_skips.sql` — the cancelled-dates table.
3. **Then build the app**: `versionCode` is already 12 in `app.json` (`75ead8d`), so build with
   `EAS_NO_VCS=1 eas build --platform android --profile release --local`, not
   `npm run build:android`, which bumps it again (to 13).
4. **Data:** the 02:00 scrape now spends its Spotify lookups on artists playing upcoming events.
   After the first run, check that the Clubs side of the app and `/clubs` have events, and that
   London's unmatched upcoming artists are falling.

Have to hand: a venue login, a **second phone or screen** for QR codes, a customer login, a
**venue you can destroy** (section 7 deletes it — do that section last), and ideally a small phone.

## 1. Web, straight after the deploy (browser)

- [x ] `/users-home` shows **Current City** from the account (not "Detecting your location…").
      **Change City** saves to the account; reload and it is still there.
- [x] **Find events** on `/users-home` → `/clubs` for that city, named in the heading. On a day
      with no events it says "There are no events in <city> on <date> yet" — never "Unknown City".
- [x ] `/update-info`: the city picker and the inputs are **readable** (dark select, visible Save
      button). The whole page was white-on-white before.
- [x] A brand-new web sign-up starts **with no city** and is offered the nearest covered city on
      `/users-home`; saving it sticks. (Existing accounts keep Berlin — expected.) - I noticed in user home there is only the option for Find events and it takes the user to /clubs, there is not /bars option
- [x] `/bars` (a venue you can destroy, see section 7): "Delete this venue" asks for the venue's
      name typed in, then deletes and lands on `/`; logging in again is refused. -  doesnt seem to be logged out? ( log out optionn available in header )
- [x ] `/barfindr`: the **Live music only** filter under the date — on, only venues with a live
      night that day; off, all of them. ( button colour is light green on blue and unreadable)
      -- after changing city in the user profile from amsterdam to berlin, /clubs showed clubs in berlin  in the header, but amsterdam clubs cards were shown.
      on web bar sign up , there is a check box for is smoking allowed inside, this should be a yes or no 

## 2. App: QR sharing (versionCode 11 FAIL)

Venue login → Venue tab → QR codes.

- [x ] Create a code, **Share**: "Preparing your QR code…" with Cancel, then the share sheet with a
      PNG. Send it to yourself and check the image.
- [x ] Share again and press **Cancel** while it prepares: the card closes, no share sheet later.
- [x ] Share again and press Android's **back** while it prepares: same as Cancel.
- [ ] Scan the **shared PNG** from the other screen with the customer login → check-in success.
- [ ] If sharing never gets past the spinner, note it (fallback: `react-native-view-shot`,
      KNOWN_ISSUES 87).

## 3. App: Bar Registration, international phone numbers (v11 issue)

- [x ] Step 2 accepts a **+49 German mobile** (13 digits) and reaches step 3 (City).
- [x ] A 6-digit number still shows "Please enter a valid phone number (7 to 15 digits)".

## 4. App: the network banner (v11 issue, dated from January)

- [x ] Airplane mode on → red **Offline** banner.
- [x ] Airplane mode off → the banner **goes away** (no green "WiFi" strip staying).
- [x ] Repeat once: on → banner, off → gone. No restart needed.

## 5. App: sign-up straight in, and the city proposal

Use a fresh e-mail address.

- [x] Sign up, enter the e-mailed code → the app goes **straight into the artist picker**, signed
      in. No "You can now log in", no login screen. -  note entering the wrong code gives non human error meassage ( HTTP error 400 =
- [x] Kill and reopen the app: still signed in.
- [x] The new account has **no city**: the app proposes the nearest covered city; accept it and
      Profile shows it. Discover and Tilki work from it.
- [x] A wrong code still shows the error and does not sign in.

## 6. App: genres — one list, and strict on events

- [x] Music tab → Genres: type "hou" → **House** itself is suggested (it never was). Same for
      "rock" and "hip hop". Saving them is accepted.
- [x ] Event form → Genres: the same suggestions. Add a made-up genre ("polka-step") and save:
      refused by name ("Not genres Clubfindr knows: polka-step"), the event is not saved; remove
      it and the save goes through. -  this needs a warning, and clear error message why
- [x] Web `/bars` event form: the quick-pick grid no longer offers "Live Music" or "Acoustic", and
      "Add another genre" suggests from the shared list.

## 7. App: recurring events as dates, live music, cancelling one date

- [x] Event form: the **Live music** switch ("A band or a live act, not only a DJ"). Save with it
      on → the Events list shows a green **Live music** badge; editing keeps it on.
- [x] "Live Music" as a **genre** is still refused — the switch is what says it now.
- [x] Create a **weekly** event starting a week or two ago: the Events tab lists its **upcoming
      dates** (several cards, each with its own date and the Weekly badge), up to two months
      ahead, four dates per series.
- [x] The form's recurrence note reads "Every date is listed and matched, for the next two
      months".
- [x] A one-off far in the future (next summer) is still listed.
- [x ] Tilki → Bars on a date the weekly night falls on: the venue appears with that night's
      genres; on the day after, it does not.
- [x] Tilki → Bars: the **Live music only** chip filters to venues with a live night that day; off
      again shows all. The order still follows your taste.
- [x] Delete a card of the repeating night: it asks **"This date only"** or **"Every date"**.
      This date only → that card goes, the other dates stay, and the venue does not show for that
      night in Tilki. (There is no un-cancel button; re-add a single event if needed.)
- [x] "Every date" removes the whole series.
- [x] A one-off still deletes with the plain "Delete event?" question.
- [x] Web `/bars`: deleting a repeating event asks the same two-step question.

## 8. App: venue account deletion — do this last

**On a venue you can destroy** (register a fresh one in the app if needed).

- [x] Venue tab → **Delete venue account** (below Log out): the first alert names the venue and
      what goes; Cancel keeps everything.
- [x ] Again → Continue → "Are you sure?" → **Delete for ever**: "Venue deleted", then the login
      screen.
- [x ] The venue login is refused afterwards, in the app and on the web.
- [ ] Your customer check-ins at **other** venues are untouched.

## 9. Carried over, still untested from versionCode 11

- [ ] The four venue tabs on a **small phone**: all labels readable.
- [ ] Nothing else in the app looks different (customer tabs, venue details, login, signup).

## Report back

For anything that fails: the section, what you did, the message shown, and the phone (small or
not, light or dark system mode).
