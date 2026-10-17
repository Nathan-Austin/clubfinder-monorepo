# Deployment plan: clubfindr Svelte 5 / Node 24 upgrade (`upgrade/svelte5`)

Status: **done.** Cut over on 2026-10-17 (`ce689f7`, PR #2); see "Cutover log". Written
2026-10-16 as the plan; the steps below are kept as the record and for rollback.

## Why this needs a plan

Pushing to `main` deploys automatically (`deploy.yml` → `deploy/deploy.sh <sha>`, using the
`deploy.sh` from the commit being deployed). As the branch stands, that deploy would fail:

| Breaks on merge                     | Cause                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`    | `engines.node ^24` + `engine-strict=true`; `deploy.sh` and `pm2-nathan.service` put Node 18.19.1 on PATH         |
| `pnpm build`                        | `$env/static/private` needs every key in `.env.example`; production `.env` still has the `VITE_*` names          |
| Main CI (so no deploy at all)       | `clubfindr-ci.yml` runs Node 18/20, pnpm 9, and only defines `VITE_*` env                                         |
| App on Node 24 after a good build   | PM2 runs the app with the daemon's Node (18) unless told otherwise; `startOrReload` keeps the old interpreter    |

`deploy.sh` runs with `set -e` and only reloads PM2 after a successful build, so a failed
build leaves the old process running. However, `build/` and `node_modules/` have already been
overwritten at that point, so a PM2 auto-restart in that window would start a broken app.

## Local verification (done, 2026-10-16)

In a throwaway `node:24-bookworm` container (Node 24.22.0, pnpm 10.34.6 via corepack). The
container was online only for `pnpm install`, apt, and the Chromium download, then
disconnected from the network for everything below:

| Step                                         | Result                                                              |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`             | clean: no warnings, no ignored build scripts                        |
| `pnpm lint`                                  | pass                                                                |
| `pnpm check`                                 | 0 errors, 0 warnings (`dev/TESTING.md` baseline of 3/3 is stale)    |
| `pnpm exec vitest run`                       | 62/62                                                               |
| `pnpm build`                                 | pass                                                                |
| `pnpm test` (Playwright, seeded Postgres 15) | 44/44                                                               |
| `NODE_ENV=production node build/index.js`    | `GET /` 200                                                         |
| CSRF                                         | `https://clubfindr.com` and `https://www.clubfindr.com` accepted with or without `ORIGIN`; `http://…` and foreign origins 403 |

CSRF impact checked: no third party POSTs forms to us (Apple `form_post` targets
`/register/login/apple`, which does not exist before or after the upgrade). The mobile app
posts JSON to `/api/mobile/*`, which the check does not apply to.

## Repo changes on the branch (merged in PR #2)

All must land in the same merge, because the deploy uses `deploy.sh` from the merged commit.
Items 1–5 are made. Item 6 is partly made: the `dev/TESTING.md` baseline is fixed; the
README, CLAUDE.md and handover-doc decisions are still open.

Verified:
- The new CI sequence passed offline against a `postgres:16` service on 54329: setup.sh in
  "existing" mode, then lint, check, unit, build and 44/44 e2e.
- `deploy.sh` dry runs against a scratch clone:
  - no `~/.local/node24`: fails in preflight, checkout untouched
  - Node 26 linked: fails with "wants 24"
  - Node 24 linked: rebuilds clubfindr only, no requirements stop, and prints the
    `pm2-nathan.service` manual-apply reminder

The `deploy.sh` preflight also guards the cutover: if S1 has not been done, the merge's
deploy stops before touching the checkout.

1. **Stable Node 24 path.** Use `/home/nathan/.local/node24` (a symlink to the nvm install,
   created in server step S1) everywhere instead of a versioned nvm path. Future patch bumps
   then only re-point the symlink.
2. **`deploy/deploy.sh`**: put `/home/nathan/.local/node24/bin` on PATH instead of
   `v18.19.1/bin`. Set `PNPM=/home/nathan/.local/node24/bin/pnpm` (the corepack shim, which
   honours `packageManager`), not `/usr/local/bin/pnpm`.
3. **`clubfindr/ecosystem.config.cjs`**: add
   `interpreter: '/home/nathan/.local/node24/bin/node'`, so the app runs on Node 24 whatever
   Node the PM2 daemon runs on.
4. **`deploy/systemd/pm2-nathan.service`**: change the PATH to `.local/node24/bin`. This is
   applied by hand (S6), not by the deploy.
5. **`.github/workflows/clubfindr-ci.yml`**:
   - one job, `node-version-file: clubfindr/.nvmrc`; `pnpm/action-setup` without `version`
     (it reads `packageManager`)
   - drop the `VITE_*` secrets; build/test run against a placeholder `.env` made by
     `dev/setup.sh`
   - Postgres service `postgres:16` on `54329:5432` with user, password and database
     `clubfindr_dev`, then `dev/setup.sh`, `pnpm lint`, `pnpm check`, `pnpm exec vitest run`,
     `pnpm build`, `pnpm exec playwright install --with-deps chromium`,
     `PW_SKIP_BUILD=1 pnpm test`
   - remove `continue-on-error` from `check` and e2e (both are green now)
6. **Docs**: README / CLAUDE.md / `PRODUCTION_HANDOVER.md`, whichever versions you keep. Fix
   the stale baseline in `dev/TESTING.md`. Update `ORIGIN` wording: it is recommended, not
   required, for the two production hosts.

Verify locally before the PR: `DRY_RUN=1 DEPLOY_REPO=<scratch clone> deploy/deploy.sh <sha>`
should report a clubfindr rebuild only, with no requirements stop. Then open the PR and let
CI go green.

## Server facts (read-only survey, 2026-10-16)

| Item                  | Found                                                                                     | Consequence                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| OS / glibc            | Ubuntu 24.04.4, glibc 2.39                                                                | fine for Node 24 and the native build binaries                                                      |
| CPU                   | **ARM64** (`node-v24.22.0-linux-arm64`)                                                   | lockfile has `linux-arm64-gnu` builds for rollup, rolldown, Tailwind oxide and lightningcss; no package compiles at install. Local runs were x86-64 only, so **S4 is the first ARM64 build** |
| Node 24               | **installed 2026-10-16**: v24.22.0, `~/.local/node24` symlink, corepack pnpm shim (S1)     | shell default left at 26                                                                             |
| nvm Node versions     | v18.19.1, v26.3.0; **no Node 24**                                                         | install it (S1)                                                                                      |
| Interactive shell     | defaults to **Node 26** (+ its own pnpm/corepack)                                         | a bare `pnpm` in an SSH shell is the wrong toolchain; always put `~/.local/node24/bin` first on PATH |
| `/usr/local/bin/pnpm` | **9.5.0** (what `deploy.sh` uses)                                                         | too old to honour `packageManager`; `engines.pnpm ^10` fails. Use the Node 24 corepack shim          |
| PM2                   | 5.4.2; app process runs `/home/nathan/.nvm/versions/node/v18.19.1/bin/node`               | the one-time `pm2 delete` + `pm2 start` at cutover is required                                      |
| `pm2` in an SSH shell | **not on PATH** (pnpm global shim `~/.local/share/pnpm/pm2`, as `deploy.sh` uses)        | call it as `$PM2` (see Cutover); logs are also readable directly in `~/.pm2/logs/`                  |
| `pm2-nathan.service`  | live PATH differs from `deploy/systemd/` copy: contains **`.`** and a vscode-server path  | drift; replace with the repo version (`.` in a service PATH is a security smell)                    |
| Repo checkout         | `main` at 93c2eca, clean                                                                  | matches `origin/main`                                                                                |
| `.env`                | 19 of the new names missing, all copyable from existing `VITE_*` keys                     | S2                                                                                                   |
| `password_resets`     | was missing; **created 2026-10-16** (S3)                                                  | done. Reset was also broken in code (fixed by PR #1, `76cab13`, deployed and verified by e-mail)    |
| Disk                  | 9.9 GB free                                                                               | fine                                                                                                 |
| Memory                | 3.7 GiB total, ~1.8 GiB available                                                         | the new build peaks at ~1.4–1.6 GB (measured; a heap cap doesn't help, it is mostly native memory). S0 |

No secret was ever exposed to the browser by the old `VITE_*` setup: the only secret read
outside server files was `VITE_PG_PASSWORD` in `$lib/db.ts`, which only server modules
import, and the old client bundle does not contain it. No rotation needed.

## Server preparation (before merge; nothing here affects the running app)

- **S0. Memory headroom.** Check swap (`swapon --show`). If there is none, or it is under
  2 GB, add a 2 GB swapfile before the staging build. Then watch `free -m` during S4. If the
  build gets OOM-killed there, it will be killed during the real deploy too.
- **S1. Node 24 next to Node 18. Done 2026-10-16** (v24.22.0).
  `nvm install 24`, then
  `ln -sfn ~/.nvm/versions/node/v24.<x>.<y> ~/.local/node24`, then
  `~/.local/node24/bin/corepack enable`.
  `nvm install` may switch the shell default to 24, which is harmless: nothing on the server
  uses the shell default.
  Check: `cd ~/clubfinder/clubfindr && ~/.local/node24/bin/pnpm --version` prints
  `10.34.6`. This only works once the new `package.json` is in that directory, so check it
  in the S4 worktree instead.
  Keep Node 18 installed for rollback.
- **S2. `.env` with both name sets. Done 2026-10-16** (19 keys added, backup
  `.env.pre-svelte5`). Back up first: `cp .env .env.pre-svelte5`. Then add
  these 19 keys **next to** the old ones, copying values:

  | add                                | value from                       |
  | ---------------------------------- | -------------------------------- |
  | `PG_HOST`                          | `VITE_PG_HOST`                   |
  | `PG_PORT`                          | `VITE_PG_PORT`                   |
  | `PG_DB`                            | `VITE_PG_DB`                     |
  | `PG_USERNAME`                      | `VITE_PG_USERNAME`               |
  | `PG_PASSWORD`                      | `VITE_PG_PASSWORD`               |
  | `CRYPTO_KEY`                       | `VITE_CRYPTO_KEY`                |
  | `SPOTIFY_CLIENT_SECRET`            | `VITE_SPOTIFY_CLIENT_SECRET`     |
  | `PUBLIC_SPOTIFY_REDIRECT_USER_URI` | `VITE_SPOTIFY_REDIRECT_USER_URI` |
  | `PUBLIC_SPOTIFY_REDIRECT_BAR_URI`  | `VITE_SPOTIFY_REDIRECT_BAR_URI`  |
  | `SOUNDCLOUD_CLIENT_ID`             | `VITE_SOUNDCLOUD_CLIENT_ID`      |
  | `SOUNDCLOUD_CLIENT_SECRET`         | `VITE_SOUNDCLOUD_CLIENT_SECRET`  |
  | `TIDAL_CLIENT_ID`                  | `VITE_TIDAL_CLIENT_ID`           |
  | `TIDAL_CLIENT_SECRET`              | `VITE_TIDAL_CLIENT_SECRET`       |
  | `PUBLIC_MAPS_API_KEY`              | `VITE_MAPS_API_KEY`              |
  | `PUBLIC_GOOGLE_OAUTH_CLIENT_ID`    | `VITE_GOOGLE_OAUTH_CLIENT_ID`    |
  | `PUBLIC_FACEBOOK_APP_ID`           | `VITE_FACEBOOK_APP_ID`           |
  | `FACEBOOK_APP_SECRET`              | `VITE_FACEBOOK_APP_SECRET`       |
  | `PUBLIC_RECAPTCHA_SITE_KEY`        | `VITE_reCAPTCHA_SITE_KEY`        |
  | `RECAPTCHA_SECRET_KEY`             | `VITE_reCAPTCHA_SECRET_KEY`      |

  Do **not** add `ORIGIN` here. `ecosystem.config.cjs` loads `.env` into the app's
  environment, so the live Node 18 app would see it at its next reload. The 19 new names
  are unread by the old code. `ORIGIN` is cutover step 0.
  - `SC_API_KEY` is in `.env.example` but neither the old nor the new code reads it, so it
    can be skipped. The handover doc's "every key must exist" really means every key the
    code imports.
  - Old code reads `VITE_*` and new code reads the new names, so one file serves both and a
    rollback needs no `.env` edit.
  - Check (from `~/clubfinder/clubfindr`): the line below should print only `SC_API_KEY`.
    `comm -23 <(git show origin/upgrade/svelte5:clubfindr/.env.example | grep -oE '^[A-Za-z_]+=' | sort) <(grep -oE '^[A-Za-z_]+=' .env | sort)`
- **S3. Database. Done 2026-10-16.** `migrations/20261012_add_password_resets.sql` was
  applied on production. The token bug in both reset endpoints (stored `encryptToken`,
  looked up with `decryptToken`) was fixed on `main` by PR #1 (`76cab13`, SHA-256 token
  hash). The same change is on this branch, and the reset flow test passes 12/12 on the
  Node 24 build.
- **S4. Staging run on the server. Done 2026-10-17** on `80efcc1`; browser checks (logins,
  search, update-info form) passed through the tunnel. Build and curl checks:
  ARM64 install in 8 s, build in 25 s, peak RAM+swap use 4.0 of 5.8 GB (the build adds
  about 1 GB). Status codes on staging matched live for `/`, `/clubs`, `/barfindr`,
  `/login/users`, `/password-reset`, `/about/us` and a 404. `/clubs` and `/barfindr` return
  500 without cookies on both (handover known issue #3). Reset-password with a bogus token
  gave 400 (DB reachable with the `PG_*` names). A form post with a foreign Origin got 403;
  with its own Origin, 401.
  - `git fetch && git worktree add --detach ~/clubfindr-staging origin/upgrade/svelte5`,
    then copy `.env` into `~/clubfindr-staging/clubfindr/`.
  - With `PATH=~/.local/node24/bin:$PATH`, run `pnpm install --frozen-lockfile && pnpm build`.
  - Run `NODE_ENV=production HOST=127.0.0.1 PORT=3001 ORIGIN=http://localhost:3001 node build/index.js`.
    `ORIGIN` must be the address the browser uses, or the CSRF check rejects every form
    post through the tunnel.
  - From the laptop, `ssh -N -L 3001:127.0.0.1:3001` and smoke-test (list below). Spotify
    login can't work here (its redirect URIs point at clubfindr.com); test it after cutover.
  - This uses the production database: logging in writes session rows and "mark interest"
    writes one row. Don't submit registrations or deletions.
  - Afterwards stop it (`kill $(cat /tmp/s4.pid)`) and run
    `git -C ~/clubfinder worktree remove --force ~/clubfindr-staging` (`--force` because of
    the copied `.env` and `node_modules`).
- **S5. Note the rollback commit:** `git -C ~/clubfinder rev-parse HEAD`. For this
  cutover it is `76cab13` (PR #1, the last deploy).

## Cutover

Pick a quiet window. The deploy runs as soon as Main CI passes on `main`.

0. Optional (the new build was tested with and without it): append
   `ORIGIN=https://www.clubfindr.com` to `.env` right before merging.
1. Merge the PR. Watch Main CI, then the "Deploy to Server" run.
2. `deploy.sh` fast-forwards, installs and builds on Node 24, runs `pm2 startOrReload`, and
   checks `GET :3000/` for 200.
3. **Once, by hand, right after the deploy:** in `~/clubfinder/clubfindr`, with
   `PM2=~/.local/share/pnpm/pm2` (bare `pm2` is not on the shell's PATH), run
   `$PM2 delete clubfindr && $PM2 start ecosystem.config.cjs && $PM2 save`, so the new
   `interpreter` is definitely used. Confirm with
   `readlink /proc/$($PM2 pid clubfindr)/exe`, which should point into
   `~/.nvm/versions/node/v24…`. Until then the reloaded process may still run on Node 18.
   The new build does start and serve `GET /` with 200 on Node 18 (tested offline), so this
   window is not an outage, but Node 18 is unsupported: do it promptly.
4. Apply `pm2-nathan.service` (repo change 4) with `sudo cp …`, then
   `systemctl daemon-reload`. This also removes the drifted live PATH (`.` and the
   vscode-server entry). It takes effect at the next boot or PM2 resurrect; the app pins its
   interpreter anyway. Before copying, `diff` the live unit against the repo version for
   any other drift.
5. Smoke-test production:
   - `GET /` returns 200
   - log in as a real listener and as a bar account
   - city/genre search gives results on `/clubs` and `/barfindr`
   - a form post (update-info with a wrong current password) shows "Invalid current
     password", not 403
   - Spotify login round trip (cookie `secure` flags changed)
   - password-reset request sends the e-mail
6. Watch `~/.pm2/logs/clubfindr-error-0.log` for 15 to 30 minutes, looking for 403
   "Cross-site POST", 500s, and `$env` errors.

## Cutover log (2026-10-17)

- PR #2 merged as `ce689f7`. Main CI passed; `deploy.sh` installed with pnpm
  10.34.6, built in 18 s and reloaded PM2; the health check returned 200.
- Step 3 by hand: `$PM2 delete/start/save`; `readlink` showed
  `~/.nvm/versions/node/v24.22.0/bin/node`; `GET /` returned 200.
- Step 4: the live `pm2-nathan.service` differed only in the PATH line. Replaced and
  `daemon-reload`ed. Its `ExecStart` runs pm2 through `/usr/bin/env node`, so at the next
  boot the PM2 daemon itself also runs on Node 24.
- Error log for the day (excluding the Spotify 403s) was clean: no "Cross-site", `$env` or
  other errors.
- Smoke tests on clubfindr.com, all passed: listener and bar logins, `/clubs` search,
  `/barfindr` (once a bar was streaming), update-info with a wrong current password
  ("Invalid current password", so the CSRF check passes the site's own forms), the
  password reset e-mail and link, and the Spotify login for users and bars (after the
  Spotify fixes below).
- Follow-up deploy `5a1e79f` (PR #3): show/hide toggle on all password fields, and
  update-info fields made readable (white text on white, a palette leftover).

## Spotify findings (2026-10-17; not caused by the upgrade)

- The Spotify login failed with `403 the user may not be registered` (also logged on
  2026-10-13, before the upgrade). Spotify's Development Mode rules, applied to existing apps
  on 2026-03-09: one Development Mode Client ID per developer, at most 5 allowlisted users
  per Client ID, and the owner needs Premium.
- `clubfindr.spotify_apps` held 4 apps that no longer exist in the dashboard (Clubfindr
  Bars 1, Party Recommender 1-3). The only user-facing app left is **Party Recommender**
  (`ab96bcae…`). It was added as a row with `is_active = false`, so nothing assigns it
  automatically. The test user and all 5 bars now point at it. Its 5 allowlist slots are
  full (1 user and 4 bar accounts).
- The Data collection 1-4 apps have no users; the scraper uses them for app-only calls.
- Recently played comes back empty for this app, even while the account is playing.
  Currently playing, the queue, top artists and playlists work.
- Extended Quota Mode is out of reach. Since 2025-05-15 it is for organisations with at least
  250k MAU, and the use case conflicts with Developer Policy III.13 (no analysis of Spotify
  content or user profiling) and III.10 (no products aimed at businesses such as bars).
  This was also the earlier rejection reason. Options: make the manual genre/artist picker the main path,
  add a Last.fm import, keep Spotify for at most 5 people.

## Rollback

Fast path (minutes), on the server:

```bash
cd ~/clubfinder && git reset --hard <S5 sha>
cd clubfindr
export PATH=/home/nathan/.nvm/versions/node/v18.19.1/bin:$PATH
/usr/local/bin/pnpm install --frozen-lockfile && /usr/local/bin/pnpm build
PM2=/home/nathan/.local/share/pnpm/pm2
$PM2 delete clubfindr && $PM2 start ecosystem.config.cjs && $PM2 save   # old config: no interpreter → daemon's Node 18
```

`.env` needs no change because of S2. Then `git revert -m 1 <merge>` and push, so `main`
matches the server again. The revert's tree is identical to the S5 commit, so its
automatic deploy only fast-forwards the checkout (0 files changed, no rebuild or restart).

## After it has been stable for a week

- Remove the `VITE_*` keys from `.env`, and remove `.env.pre-svelte5`.
- The PM2 daemon still runs on Node 18 until the next reboot (the new unit then starts it on
  Node 24). To switch sooner: `pm2 kill`, then restart `pm2-nathan.service`.
- Rename or remove the old GitHub `VITE_*` secrets.
- PM2 logs are not rotated (`clubfindr-error-0.log` was 9 MB on 2026-10-16): install
  `pm2-logrotate` or add a logrotate rule.
- `$lib/email.ts` hard-codes `mail.spacemail.com`, so CI and local e2e runs try to log in
  to the real mail provider with placeholder credentials (refused with 535; the tests
  expect the failure). Make the host configurable and point tests at nothing or a fake
  SMTP server.
- Spotify: decide on the options above. Until then, pause spotify_service's add-user and
  add-bar automation, which creates and fills apps against the new one-Client-ID rule. Retire
  the 4 dead `spotify_apps` rows once nothing references them.
- Two test bars have `music_service = 'Spotify'` (capital S). `login/bars` compares with
  `'spotify'`, so they skip the Spotify flow. Normalise the data or compare case-insensitively.
- `bcryptjs` ends up in the browser bundle (build warning "Module crypto has been
  externalized"). Something client-side imports the password utilities; move them to
  `$lib/server`.
- Handover known issue #7 (colour classes outside the palette) also hides text: update-info
  was fixed in PR #3; check the other pages that use `bg-gray-*`/`text-gray-*`.
- Handover doc follow-ups: bump `@playwright/test`, then the known-issues list. Worth
  prioritising: #3 (500s without cookies), #1 (UTC dates), #2 (Spotify token expiry).
