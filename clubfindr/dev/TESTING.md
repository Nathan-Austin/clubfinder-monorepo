# Testing clubfindr locally

How to run clubfindr against a local Postgres with synthetic data and no external APIs.

Everything in `dev/seed.sql` is invented: clubs, bars, artists, events and people are
fictional, and e-mail addresses use the reserved `.test` domain. Event dates are relative to
the current date, so there are always upcoming events (from 3 days ago to 21 days ahead).

## Requirements

- Node 20 (see `.nvmrc`). The build crashes on Node 26 (`buffer-equal-constant-time`, used by
  `jsonwebtoken`).
- pnpm 9 or 10. pnpm 11 also works, but exits 1 on install until the dependency build scripts
  are approved; run scripts with `pnpm --config.verify-deps-before-run=false <script>`.
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
   `VITE_CRYPTO_KEY` and `JWT_SECRET` values. All other keys keep their placeholder values.

It is safe to re-run; each run resets the data to the seed. It never overwrites a `.env` that
it did not write; use `dev/setup.sh --force` to replace one (the old file is kept as
`.env.bak`). `dev/setup.sh --stop` stops the Postgres it started.

Settings can be changed with `DEV_PG_HOST`, `DEV_PG_PORT`, `DEV_PG_DB`, `DEV_PG_USER`,
`DEV_PG_PASSWORD` and `DEV_PG_IMAGE`.

### Using an existing Postgres

Either point the `DEV_PG_*` variables at a role that can create databases, or give setup a
superuser URL and let it create the role:

```bash
DEV_PG_PORT=5432 DEV_PG_ADMIN_URL=postgres://postgres:secret@127.0.0.1:5432/postgres dev/setup.sh
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
pnpm check         # svelte-check: 3 known type errors (see below)
pnpm exec vitest run
pnpm build
```

None of these needs the database or network. `pnpm build` needs every key in `.env` to be
defined (placeholders are fine), which `dev/setup.sh` takes care of. Use `vitest run`:
`pnpm test:unit` starts Vitest in watch mode.

Known baseline: `pnpm check` reports 3 errors, 0 warnings, in
`src/routes/soundcloud/+page.server.ts` (2) and `src/routes/tidal/+page.svelte` (1). All other
checks pass. `pnpm test` (Playwright) cannot pass: there is no `tests/` directory, and its web
server listens on port 3000 while Playwright waits on 4173.

## Running the app

```bash
pnpm build
node --env-file=.env build/index.js     # http://localhost:3000
```

`pnpm dev` (development server, also port 3000) and `pnpm preview` read `.env` themselves.

- The database settings (`VITE_PG_*`) are compiled in at build time: rebuild after changing
  them.
- Open the app at `http://localhost:3000`. Login cookies are marked `Secure`, which browsers
  accept on `localhost` but not on other plain-HTTP hosts.
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
