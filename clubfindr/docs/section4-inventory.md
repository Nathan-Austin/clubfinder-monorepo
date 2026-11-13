# ROADMAP section 4: input validation and raw SQL inventory

Taken 2026-11-13 at `5cadae7` over `clubfindr/src` (77 `+server.ts` endpoints and 1 form action).
A first pass to decide the work order, not a fix list: every finding below is unfixed unless it
says otherwise. KNOWN_ISSUES 51-56 hold the security findings from the section 1 work.

Method: a heuristic scan of each endpoint (methods, where input comes from, auth calls, type
checks, SQL built with `${…}` or `+`), then reading every flagged site by hand. The scan scripts
were throwaway; the counts below are from them.

## 1. SQL built from strings: no injection found

18 SQL template literals interpolate something; none interpolates request input. No SQL is
built by `+` concatenation.

| Site                                                      | What is interpolated                                                                           | Verdict          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| `$lib/taste/favouriteArtists.ts` (6 queries)              | `table`, `column` from `scope(owner)`, a fixed map (`user`/`bar`) that throws on anything else | safe             |
| `api/bars/[barId]` PATCH, `api/mobile/bars/[barId]` PATCH | column names from a fixed allow-list; values as `$n`                                           | safe             |
| `api/mobile/bars/stats` (3 queries)                       | `timeConstraint`, one of three constant fragments                                              | safe             |
| `api/update-user`, `update-info` action                   | constant `name`/`email`/`password_hash` fragments, `$n`                                        | safe (but see 2) |
| 5 confirm/resend routes                                   | `BAR_CODE_SECONDS_LEFT_SQL`, a constant (`$lib/server/barCodeExpiry`)                          | safe             |

Recommendation: keep it that way with a source guard, like
`src/lib/server/no-pooled-transactions.test.ts`: fail on `${` inside an SQL template literal unless
the expression is on an allow-list (`table`, `column`, `setClause`, the named constants). Outside
the web app, barfindr's raw `text()` SQL is constant, and data_collection's B608 hits are the
false positives KNOWN_ISSUES 46 describes.

## 2. Queries that cannot work

The pool sets no `search_path` (`$lib/db`), so a table named without `clubfindr.` does not resolve
for the dev role (checked: `relation "bar_qr_codes" does not exist`). Production's role may differ;
check its logs before assuming these fail there too (KNOWN_ISSUES 43 was the same pattern and did).

- **QR codes**: `api/mobile/bars/[barId]/qrcodes` (GET, POST), `…/qrcodes/[qrId]` (DELETE),
  `…/qrcodes/[qrId]/promotion` (POST): `bar_qr_codes`, `bars`, `promotion_requests` unqualified.
  Only their 403 paths are tested (`tests/mobile-bar-auth.spec.ts`).
- **Check-in**: `api/mobile/checkin`: `user_checkins` unqualified.
- **Promoter code resend**: `register/promoter/confirm/resend-code`: `users`, `bars` unqualified.
- **`api/update-user`**: `users` unqualified, a `email` column that does not exist (it is
  `general_email`), and `locals.user`, which `/api/*` never gets (`hooks.server.ts` returns early).
  Nothing calls it: delete it.
- **`update-info` action**: writes `SET email = …`, so changing the e-mail on `/update-info` fails
  with "column email does not exist". The name and password changes work.

## 3. Authorization gaps, most serious first

1. **Venue writes accept a forged `barId` cookie** (KNOWN_ISSUES 52): `canManageBar` trusts the
   plain cookie, so every endpoint behind `denyUnlessBarManager` and the venue taste endpoints
   can be driven for any venue. Fix: a server-side session (or an encrypted `cookieManager`
   cookie) for the web dashboard, as the Bearer path already has.
2. **Promoter routes trust a plain `promoterId` cookie** (KNOWN_ISSUES 51).
3. **`api/mobile/checkin` has no auth**: `userId`, `barId`, `qrId` and `timestamp` come from the
   body, so anyone can record check-ins for anyone (venue stats count them). Moot until 2 is fixed,
   but fix both together.
4. **`api/save-cookie-consent` POST takes `userId` from the body** and updates that user's
   preferences; it has to use the session (the GET already uses `locals.user`).
5. **`api/mobile/signup/complete` has no auth** (KNOWN_ISSUES 56); nothing calls it: delete it.
6. **Debug endpoints in production**: `api/soundcloud/debug-token`, `api/tidal/debug-token` set
   any token passed in `?token=` as the visitor's own provider cookie. Only self-harm today, but a
   link can plant a token in someone else's browser: delete them.
7. Confirmation codes: unlimited server-side attempts (KNOWN_ISSUES 55).
8. `/login/bars` re-sends every cookie without its flags (KNOWN_ISSUES 53).

Not a gap: encrypted cookies (`cookieManager`: AES-256-GCM, so `usersId`/`sessionId` cannot be
forged); the CORS wildcard on all of `/api/*` (`hooks.server.ts`) sends no
`Access-Control-Allow-Credentials`, so browsers do not attach cookies cross-origin (KNOWN_ISSUES 54
is low risk; restrict it anyway once the app's needs are clear).

## 4. Missing input validation

34 of the 72 endpoints that read input show no validation at all (no type, shape, length or id
checks); most of the rest check presence only. Typical consequences: a non-string where a string
is expected throws and answers 500 with a stack in the logs; unbounded strings and arrays reach
the database; types pass straight into columns (the bar PATCH routes accept any JSON for
`smoking_allowed` or `bar_types`).

No validation at all, by group:

- **Auth and account** (rate limit is the global 60/min per IP only): `login/bars`,
  `api/mobile/login`, `api/mobile/bars/login`, `api/request-password-reset`,
  `api/send-verification-code`, `api/resend-verification-code`, `api/verify-confirmation`,
  `api/verify-email-code`, `api/mobile/bars/confirm`, `api/mobile/bars/resend-code`,
  `register/promoter` (captcha only), `register/promoter/confirm`, `register/promoter/confirm/resend-code`,
  `register/confirm/resend-code`, `api/verify-captcha`, `api/request-access`.
- **Writes**: `api/mark-interested`, `api/mark-bar-interested` (any `eventId` is stored),
  `api/mobile/checkin`, `api/save-cookie-consent`, `api/update-user-name` (no length cap),
  `promoter-home/events` POST, `…/qrcodes` POST, `…/promotion` POST, `storestate` (stores
  arbitrary JSON of any size in `oauth_states` and sets cookies from it, unauthenticated).
- **Reads / search**: `api/artists/search`, `api/venues/search`, `api/mobile/bars` (GET, POST),
  `…/qrcodes` GET, `…/qrcodes/[qrId]` DELETE (`qrId` unchecked), `api/soundcloud/auth`,
  `api/tidal/auth`, `logout`.

Also seen: several handlers log whole request bodies or SQL parameters, which puts e-mail
addresses and other personal data in `pm2 logs` (`api/mobile/bars` POST, the bar PATCH routes,
`api/mobile/signup`'s request summary).

Well covered already, and the pattern to copy: the taste endpoints (`/api/taste/*`,
`/api/venues/:barId/taste/*`: `isUuid`, length limits, 400 before any query), `api/spotify/*`,
the two matching endpoints and `register` (captcha, then fields).

## 5. Suggested order

1. Close 3.1 (with a regression test that a forged `barId` cookie is refused), then 3.2-3.5.
2. Delete what nothing calls: `api/update-user`, `api/mobile/signup/complete`, both
   `debug-token` routes.
3. Fix section 2's broken queries (qualify the tables; `update-info` writes `general_email`),
   each with an e2e test of the success path.
4. One small validation helper in `$lib/server/validate.ts` (string with length bounds, e-mail,
   uuid, boolean, string array with caps, integer range), answering `400 { message }` before any
   query. No validation library is a dependency today; hand-written guards like `isUuid` keep it
   that way, and adding `zod`/`valibot` is the alternative (owner's call). Apply it endpoint by
   endpoint, auth and account routes first, each with a test that bad input is a 400, not a 500.
5. The SQL source guard from section 1, and drop the request-body logging.
