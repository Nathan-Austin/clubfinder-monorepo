# Device checklist: Android build of 2026-11-16 evening

For the build from this branch (Play internal testing). Bump `versionCode` (9 → 10) with
`npm run build:android` or `scripts/bump-version.js`; nothing in the session touched it. Build with
`EAS_NO_VCS=1` as `CLAUDE.md` says.

**The app talks to production (`https://www.clubfindr.com`).** Items marked **[deploy]** need the
web side of this branch deployed first. Without the deploy each one fails in the safe way described,
never with a crash.

Use a phone in **dark mode** for the first section (that's where the invisible text showed up).

## 0. Before installing
- [ ] `aapt2 dump permissions <apk>`. The `android.permission.*` ones should be exactly
      `ACCESS_COARSE_LOCATION`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CAMERA`,
      `FOREGROUND_SERVICE`, `INTERNET`, `POST_NOTIFICATIONS`, `READ_APP_BADGE`,
      `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `WAKE_LOCK`. No `ACCESS_FINE_LOCATION`, `RECORD_AUDIO`,
      `SYSTEM_ALERT_WINDOW`, storage or Bluetooth. (KNOWN_ISSUES 65)
- [ ] Also expected, and not new: `com.clubfindr.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
      `com.google.android.c2dm.permission.RECEIVE`, Play's install-referrer one and about 20
      launcher-badge ones (`com.sec…badge`, `com.huawei…CHANGE_BADGE`, …). They come with
      `expo-notifications`, which stays until you decide on notifications (KNOWN_ISSUES 77).

## 1. Login screen (KNOWN_ISSUES 69)
- [ ] Type in the e-mail and password fields: the text is **visible** (dark on white).
- [ ] The e-mail field doesn't autocorrect or capitalise as you type.
- [ ] Wrong password, customer mode: "Email or password incorrect", not the generic message.
- [ ] "Forgot password?" in **customer** mode opens the web reset page in a browser tab.
- [ ] Same in **Bar Manager** mode; the page's "Back to Login" goes to the venue login **[deploy]**.
- [ ] Signup, venue registration, delete-account and e-mail-code screens: typed text visible in
      every field.

## 2. Venue login (KNOWN_ISSUES 68, 69, 70)
- [ ] **Venue login works at all on Android.** Every Android venue login answered 400 from
      2026-11-14 (KNOWN_ISSUES 70). This build sends the version as text, so it works **even
      before the deploy**. If it fails, note the message shown.
- [ ] Log in with the venue's own e-mail and password → dashboard.
- [ ] **[deploy]** Log in with the *personal* account that registered the venue → the same
      dashboard. Before the deploy: "Invalid credentials".
- [ ] **[deploy]** A personal account with no venue → "No venue is linked to this account".
- [ ] **[deploy]** Forgotten venue password: "Forgot password?" in Bar Manager mode → enter the
      venue e-mail → the mail arrives → set a new password → venue login works with the new one,
      not the old one.

## 3. Venue dashboard
- [ ] Dashboard loads: name, events, stats.
- [ ] Edit Profile: change the description, save, reopen → kept.
- [ ] Create an event, edit it, delete it.
- [ ] Artists You Play: add an artist through the picker.
- [ ] Log out → back on the login screen.

## 4. QR codes (venue side)
- [ ] QR Code Management: **create** a code.
- [ ] **Share** it: the share sheet opens with a PNG (written to the app's cache, no storage
      permission asked for).
- [ ] **Delete** it; also delete one that has been scanned (KNOWN_ISSUES 58).

## 5. Check-in by scanning (customer side, KNOWN_ISSUES 66)
- [ ] Profile → Scan QR Code: the camera permission prompt shows, then the camera. **No
      microphone prompt.**
- [ ] Scan the venue's code from section 4 on a second screen → check-in success, venue name
      and count.
- [ ] Scan any non-Tilki QR code → a clear refusal, no crash.

## 6. City (KNOWN_ISSUES 67)
- [ ] The location prompt says **approximate** ("Tilki uses your approximate location…") and
      Android offers only approximate.
- [ ] Home title names the account's city ("Bars in London").
- [ ] If you're in a covered city other than the account's: Home offers "You seem to be in X.
      Switch?" once. "Keep" doesn't ask again for that city.
- [ ] Profile → Your City shows the account's city. "Use my location" proposes the nearest
      covered city.
- [ ] Pick another city: Home reloads with that city's venues, **no new login**.
      - **[deploy]** No note shown; log out and back in → the new city is still there.
      - Before the deploy: the note "Saved on this phone. Your account follows once the
        server is updated" shows; after a fresh login the account's old city comes back.
- [ ] Web, **[deploy]**: `/update-info` → Your city → change it → `/clubs` uses it.

## 7. Distance with approximate location (KNOWN_ISSUES 65)
- [ ] Home → distance filter on, 2 km: the list and its distances still look right
      (approximate location is 1-3 km off, so expect the order to be rougher).
- [ ] Location turned off at the system level: venues still list, without distances. (There's
      no fake Berlin position any more.)

## 8. Errors instead of made-up venues
- [ ] Airplane mode, then open Home (and Tilki after a search): **"We couldn't load venues just
      now" with "Try again"**. No "Club XYZ, 123 Main St, Berlin".
- [ ] Airplane mode off, tap Try again → the real list.

## 9. Things that changed in passing
- [ ] Profile has no "Push Notifications" switch (it never did anything).
- [ ] Discover, Search, Tilki: a genre search still returns venues (the city now comes from one
      place, `services/cityService`).
- [ ] Onboarding artist picker after a fresh signup, as in this morning's run.

## Report back
For anything that fails: the screen, what you did, the message shown, and whether the web side
had been deployed yet.
