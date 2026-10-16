# Testing clubfindr locally

How to run clubfindr against a local Postgres with synthetic data and no external APIs.

Everything in `dev/seed.sql` is invented: clubs, bars, artists, events and people are
fictional, and e-mail addresses use the reserved `.test` domain. Event dates are relative to
the current date, so there are always upcoming events (from 3 days ago to 21 days ahead).

## Requirements

- Node 24 (see `.nvmrc`). `package.json` `engines` plus `engine-strict` in `.npmrc` make
  `pnpm install` refuse any other major, so you cannot build on the wrong Node by accident.
  The build crashes on Node 26 (`buffer-equal-constant-time`, used by `jsonwebtoken`, needs
  the removed `SlowBuffer`). To get Node 24:
  - nvm: `nvm install` in this directory reads `.nvmrc`; `nvm use` afterwards.
  - fnm / volta / mise: also read `.nvmrc`.
  - Debian/Ubuntu without a version manager: NodeSource `setup_24.x`, then
    `apt install nodejs`.
- pnpm 10.34.6, pinned in the `packageManager` field of `package.json`. Any of these gives
  you exactly that version:
  - `corepack enable` (Corepack ships with Node), then just run `pnpm`.
  - an already installed pnpm 10 or newer: it reads `packageManager` and switches to 10.34.6
    on first use (downloaded once, verified against the npm registry signature). Set
    `manage-package-manager-versions=false` in `.npmrc` if you need to stop that.
  - `npm i -g pnpm@10.34.6`.
- Sandboxes and registry proxies: pnpm's version switch verifies the downloaded pnpm against
  the npm registry's signatures. Behind a proxy that strips them (the case in the sandbox this
  upgrade was done in) every `pnpm` call fails with "its npm registry signature could not be
  verified". The fix is to install 10.34.6 directly and turn the switch off for the shell:

  ```bash
  export PATH=/home/model/tools/node24/bin:$PATH        # wherever Node 24 lives
  rm /home/model/tools/node24/bin/pnpm /home/model/tools/node24/bin/pnpx 2>/dev/null
  npm i -g pnpm@10.34.6 && hash -r
  export npm_config_manage_package_manager_versions=false
  cd /workspace/clubfindr && ./dev/setup.sh
  pnpm lint && pnpm check && pnpm exec vitest run && pnpm build && pnpm test
  ```

  Run the checks one after another: `pnpm test` builds into `build/` itself, so running it
  alongside `pnpm build` makes the two overwrite each other.

- No dependency has install scripts, so `pnpm install --frozen-lockfile` is clean and needs no
  `pnpm approve-builds`. Dependency updates that add one will show up as a warning (pnpm 10)
  or an error (pnpm 11+): add the package to `pnpm.onlyBuiltDependencies` in `package.json`
  if the script is needed, or to `pnpm.ignoredBuiltDependencies` if not.
- Postgres 13 or later, one of:
  - Postgres server binaries (`initdb`, `pg_ctl`): setup creates a private cluster in
    `dev/.pgdata`
  - Docker: setup starts a `postgres:16` container named `clubfindr-dev-postgres`
  - an existing server: see "Using an existing Postgres" below
- `psql` on the PATH (with Docker it can use the one inside the container).

## Setup

```bash
pnpm install
dev/setup.sh
```

`dev/setup.sh`:

1. Finds or starts Postgres on `127.0.0.1:54329`.
2. Creates the `clubfindr_dev` database and role (password `clubfindr_dev`) if missing.
3. Loads `dev/schema.sql` if the `clubfindr` schema does not exist yet.
4. Loads `dev/seed.sql`, which empties every `clubfindr` table and inserts the test data.
5. Writes `.env` from `.env.example` with the local database settings and random
   `CRYPTO_KEY` and `JWT_SECRET` values. All other keys keep their placeholder values.

It is safe to re-run; each run resets the data to the seed. It never overwrites a `.env` that
it did not write; use `dev/setup.sh --force` to replace one (the old file is kept as
`.env.bak`). A `.env` from before the upgrade uses the old `VITE_*` names: `--force`
rewrites it with the current ones (see `docs/PRODUCTION_HANDOVER.md` for the rename table).
`dev/setup.sh --stop` stops the Postgres it started.

Settings can be changed with `DEV_PG_HOST`, `DEV_PG_USER`, `DEV_PG_PASSWORD` and
`DEV_PG_IMAGE`.

### Seed guard

`seed.sql` empties every `clubfindr` table, so it is guarded twice:

- `dev/setup.sh` only seeds a database named `clubfindr_dev` on port 54329. It refuses to start
  if `DEV_PG_DB` or `DEV_PG_PORT` say otherwise, and before loading it prints the target and
  checks the database name on the live connection.
- `seed.sql` itself aborts unless `current_database()` is `clubfindr_dev`. The check runs inside
  the seed's transaction, so even a client that carries on after errors changes nothing.

### Using an existing Postgres

The server must listen on port 54329 (see the seed guard). Either point `DEV_PG_HOST`,
`DEV_PG_USER` and `DEV_PG_PASSWORD` at a role that can create databases, or give setup a
superuser URL and let it create the role:

```bash
DEV_PG_ADMIN_URL=postgres://postgres:secret@127.0.0.1:54329/postgres dev/setup.sh
```

### Resetting the schema

Setup does not reload the schema once it exists. To start completely fresh:

```bash
PGPASSWORD=clubfindr_dev psql -h 127.0.0.1 -p 54329 -U clubfindr_dev -d postgres \
  -c 'DROP DATABASE clubfindr_dev'
dev/setup.sh
```

## Checks

```bash
pnpm lint          # Prettier + ESLint
pnpm check         # svelte-check: 0 errors, 0 warnings
pnpm exec vitest run
pnpm build
pnpm test          # Playwright end-to-end tests, see "End-to-end tests" below
```

None of the first four needs the database or network. `pnpm build` needs every key in `.env` to be
defined (placeholders are fine), which `dev/setup.sh` takes care of. Use `vitest run`:
`pnpm test:unit` starts Vitest in watch mode.

All components use Svelte 5 runes; `svelte.config.js` forces runes mode for every component
outside `node_modules`, so any legacy syntax (`export let`, `$:`, `on:click`, stores in
components) is a compile error rather than a silent fallback.

Styling is Tailwind 4 through `@tailwindcss/vite`: the theme lives in `src/app.css` (`@theme`),
there is no `tailwind.config` or PostCSS config. The palette is deliberately limited to the
colours the old config defined (`--color-*: initial` first), built on the `--rgb-*` triplets.
Component `<style>` blocks that use `@apply` start with `@reference '../../app.css'`.

What works on Node 24 / pnpm 10.34.6 with the Svelte 5, SvelteKit 2.70, Vite 8, Tailwind 4,
TypeScript 6, ESLint 10 (flat config), Prettier 3 and Playwright stack:

| Command                               | Status                                               |
| ------------------------------------- | ---------------------------------------------------- |
| `pnpm install --frozen-lockfile`      | clean, no build scripts, no warnings                 |
| `pnpm lint`                           | passes, no warnings                                  |
| `pnpm check`                          | 0 errors, 0 warnings                                 |
| `pnpm exec vitest run`                | 4 files, 62 tests pass                               |
| `pnpm build`                          | passes                                               |
| `node --env-file=.env build/index.js` | production server on :3000                           |
| `pnpm dev`                            | Vite 8 dev server on :3000                           |
| `pnpm preview`                        | serves the build on :3000                            |
| `pnpm build-scripts`                  | compiles `scripts/` to `dist-scripts/`               |
| `pnpm test`                           | 44 Playwright tests pass against the seeded database |
| `pnpm format`                         | Prettier 3 with prettier-plugin-svelte 4             |

Baseline (re-checked 2026-10-16 in a clean Node 24 container): every command above passes
with no errors or warnings. Treat any new `pnpm check` or lint output as a regression.

## End-to-end tests

`pnpm test` runs the Playwright suite in `tests/` against the production build, served by
`vite preview` on port 4173 and backed by the seeded database. It needs:

- `dev/setup.sh` run once (database on 54329 and `.env`; re-run it to reset the data),
- the browser: `pnpm exec playwright install chromium` once per machine (CI: `--with-deps`),
- nothing else: every request that does not go to `localhost:4173` is blocked, so the tests
  pass with no Google, Spotify, SoundCloud, Tidal or e-mail access.

```bash
pnpm test                                  # builds, starts the preview server, runs everything
PW_SKIP_BUILD=1 pnpm test                  # reuse the existing build/ (after a manual pnpm build)
pnpm exec playwright test tests/auth.spec.ts       # one file
pnpm exec playwright test -g "genre picker"        # by title
pnpm exec playwright test --ui                     # interactive
pnpm exec playwright show-report                   # after a CI run (html reporter)
```

What is covered (`tests/*.spec.ts`):

| File               | Flows                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages.spec.ts`    | every public page renders and hydrates without JS errors; cookie banner and preferences; desktop dropdown and mobile menu; logged-out protection; `robots.txt`    |
| `auth.spec.ts`     | the three seeded logins land on `/users-home`, `/promoter-home`, `/bars`; wrong password; logout                                                                  |
| `search.spec.ts`   | city + genre search to `/clubs` and `/barfindr`; marking interest when logged in; `/clubs` without a search; the genre picker (browse, select all, search, clear) |
| `bars.spec.ts`     | bar manager: bar details modal (pre-fill, edit chips, cancel) and event modal (fields, preset and custom genres, recurring, failed save, cancel, close)           |
| `promoter.spec.ts` | promoter: venue search and selection, `GenreSelector` (expand, search, select, remove), performer form with artist and track search                               |
| `forms.spec.ts`    | password reset (both pages), update-info validation, custom genres on `/selectedGenres`, delete-confirmation, registration code resend, users-home feedback/city  |

`tests/fixtures.ts` holds the shared pieces: the offline route blocking, a distinct
`x-forwarded-for` per test (the app rate-limits 60 requests/minute per address, which a
parallel run would hit otherwise), `login()`, and the `pageErrors` fixture that fails a test
on any uncaught error in the page.

The suite does not change the seed: nothing it submits is persisted (saves that need Spotify,
a bar id or e-mail fail offline, and the validation cases never reach the server). The one
exception is "mark interest" on `/clubs`, which writes a row that the seed reloads.

## Running the app

```bash
pnpm build
ORIGIN=http://localhost:3000 node --env-file=.env build/index.js     # http://localhost:3000
```

`ORIGIN` tells adapter-node the public origin (it assumes `https://` otherwise), which the
CSRF check compares form posts against; `pnpm dev` and `pnpm preview` do not need it.

`pnpm dev` (development server, also port 3000) and `pnpm preview` read `.env` themselves.

- The database settings (`PG_*`) are compiled in at build time: rebuild after changing them.
- Open the app at `http://localhost:3000`. Cookies are marked `Secure` in every build (only
  `pnpm dev` drops the flag), which browsers accept on `localhost` but not on other
  plain-HTTP hosts.
- The app rate-limits to 60 requests per minute per IP, read from `X-Forwarded-For`. Without a
  proxy every local client shares one bucket, so a scripted crawl faster than that gets
  `429 Too Many Requests` (restart the app to reset it).

## Test logins

| Role         | E-mail                    | Password          | Log in at      | Lands on         |
| ------------ | ------------------------- | ----------------- | -------------- | ---------------- |
| Regular user | `listener@clubfindr.test` | `Listener#2026`   | `/login/users` | `/users-home`    |
| Promoter     | `promoter@clubfindr.test` | `Promoter#2026`   | `/login/bars`  | `/promoter-home` |
| Bar manager  | `bar@clubfindr.test`      | `BarManager#2026` | `/login/bars`  | `/bars`          |

Passwords are hashed with bcrypt (10 rounds), the same way the app hashes them. `/login/bars`
is the "Partners" login. Login by Google, Facebook or Spotify needs those services.

Besides the bar manager's bar (The Copper Lantern) and the promoter's (Static Orchard), the seed
has one more bar in Berlin, one in London and one in Amsterdam; 225 club events in Berlin, London and Amsterdam with 24
artists; and bar events for the barfindr pages. `spotify_apps` is left empty on purpose: with
no Spotify credentials the bar login skips the Spotify redirect.

## What works offline

Every page below was loaded in a browser with all non-local requests blocked. Google Tag
Manager is blocked on every page, which only shows up as console errors.

### Works offline

| Page                                                                                                    | Notes                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                                     | Renders. City list and genre picker are local files, so "select a city, pick genres, search" works. Address search and nearest-city lookup use Google Maps and do nothing offline. The Spotify, SoundCloud and Tidal buttons go to those services. |
| `/clubs`                                                                                                | Club events for the city, date and genres chosen on `/`, ranked by genre match. Only events whose genres match appear. Opening it without searching first gives a 500 error page (no city cookie), as in production.                               |
| `/barfindr`                                                                                             | Bars for the chosen city, with their now-playing genre profile and upcoming bar events. Same search requirement as `/clubs`. The genre choice is used once: search again from `/` before opening it a second time.                                 |
| `/login/users`                                                                                          | E-mail and password login works. The Google and Facebook buttons do not load.                                                                                                                                                                      |
| `/login/bars`                                                                                           | Promoter and bar manager login works.                                                                                                                                                                                                              |
| `/users-home`                                                                                           | Regular user: name, top genres and saved events. The map does not load (Google Maps). "Connect" buttons for Spotify, SoundCloud and Tidal go to those services.                                                                                    |
| `/update-info`                                                                                          | Regular user: the account form loads. Logged out it returns 401.                                                                                                                                                                                   |
| `/promoter-home`                                                                                        | Promoter: current and past events at Parallax Cellar with line-ups. Logged out it returns a 500 error page.                                                                                                                                        |
| `/bars`                                                                                                 | Bar manager: the dashboard frame with the bar name and a "Spotify Authentication Required" dialog; the playback, artist and playlist panels stay empty. Logged out it redirects to `/login/bars`.                                                  |
| `/about/us`, `/about/contact`, `/about/terms`                                                           | Static pages.                                                                                                                                                                                                                                      |
| `/about/blog`                                                                                           | Renders; its images come from Wikimedia and do not load.                                                                                                                                                                                           |
| `/policies/*`                                                                                           | Static pages.                                                                                                                                                                                                                                      |
| `/selectedGenres`, `/confirm-bar`, `/delete-confirmation`, `/password-reset`, `/password-reset/<token>` | The pages render. Anything they submit that sends e-mail delivers nothing offline (see below).                                                                                                                                                     |

### Needs external services

| Page or feature                                   | Service                                 | Offline                                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/register`, `/register/promoter`                 | Google reCAPTCHA, Google Maps, e-mail   | The forms render, but submitting needs reCAPTCHA, and the confirmation code is sent by e-mail. Not testable offline; use the seeded accounts.                   |
| `/register/confirm`, `/register/promoter/confirm` | e-mail                                  | Render; the code they ask for only arrives by e-mail.                                                                                                           |
| Password reset, delete-account codes              | e-mail (SMTP to `mail.spacemail.com`)   | No e-mail arrives: the placeholder SMTP credentials cannot send. The app logs the send error. Not exercised in testing (it would contact the real mail server). |
| `/spotify`                                        | Spotify                                 | 401 page without a Spotify session.                                                                                                                             |
| `/spotify/search`                                 | Spotify                                 | The page renders; searching needs the Spotify API.                                                                                                              |
| `/spotify/login`                                  | Spotify OAuth callback                  | Opened directly, redirects to `/?error=Invalid state returned from OAuth`.                                                                                      |
| `/soundcloud`                                     | SoundCloud                              | Redirects to SoundCloud's login (`/api/soundcloud/auth`), which fails offline.                                                                                  |
| `/tidal`                                          | Tidal                                   | Redirects to Tidal's login (`/api/tidal/auth`), which fails offline.                                                                                            |
| `/redirect`                                       | App stores                              | Sends the browser to the Google Play or App Store page.                                                                                                         |
| Google and Facebook login                         | Google, Facebook                        | The buttons do not load.                                                                                                                                        |
| Maps, address search, nearest city                | Google Maps                             | Not shown; the rest of the page works.                                                                                                                          |
| Spotify app assignment                            | `SPOTIFY_SERVICE_URL` (spotify_service) | Only used when a bar has `music_service = 'spotify'` or a new user registers; the seed avoids both.                                                             |
