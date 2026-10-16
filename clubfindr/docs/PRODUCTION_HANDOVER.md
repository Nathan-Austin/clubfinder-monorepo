# Production handover: moving clubfindr to the upgraded stack

This covers the production server (Node 18.19.1, PM2, nginx, `deploy/deploy.sh`) and the
GitHub Actions workflows, which are outside this directory. Steps are in the order to do
them; items marked **before merge** must be in place before `main` carries this code,
because the deploy runs `pnpm install --frozen-lockfile && pnpm build` and both now refuse
the old setup.

## Checklist

### Server toolchain (before merge)

- [ ] Install Node 24 (`nvm install 24`, or NodeSource `setup_24.x`). `package.json#engines`
      plus `engine-strict` in `.npmrc` make `pnpm install` exit 1 on any other major.
- [ ] pnpm 10.34.6: `corepack enable` (then `pnpm` resolves `packageManager` itself), or
      `npm i -g pnpm@10.34.6`. Any pnpm 10+ also switches to 10.34.6 on its own.
- [ ] Update the PATH line in the `nathan` shell profile, `deploy/deploy.sh` and
      `pm2-nathan.service` from `~/.nvm/versions/node/v18.19.1/bin` to the Node 24 path.
- [ ] PM2 was started under Node 18: after the switch run `pm2 kill`, then
      `pm2 resurrect` (or restart `pm2-nathan.service`) so the daemon and the app run on
      Node 24. `pm2 startOrReload` alone keeps the old binary.
- [ ] Playwright is not needed on the server (tests run in CI / locally).

### `.env` on the server (before merge)

Every key must exist at build time. Rename:

| old                              | new                                |
| -------------------------------- | ---------------------------------- |
| `VITE_PG_HOST`                   | `PG_HOST`                          |
| `VITE_PG_PORT`                   | `PG_PORT`                          |
| `VITE_PG_DB`                     | `PG_DB`                            |
| `VITE_PG_USERNAME`               | `PG_USERNAME`                      |
| `VITE_PG_PASSWORD`               | `PG_PASSWORD`                      |
| `VITE_CRYPTO_KEY`                | `CRYPTO_KEY`                       |
| `VITE_SPOTIFY_CLIENT_SECRET`     | `SPOTIFY_CLIENT_SECRET`            |
| `VITE_SPOTIFY_REDIRECT_USER_URI` | `PUBLIC_SPOTIFY_REDIRECT_USER_URI` |
| `VITE_SPOTIFY_REDIRECT_BAR_URI`  | `PUBLIC_SPOTIFY_REDIRECT_BAR_URI`  |
| `VITE_SOUNDCLOUD_CLIENT_ID`      | `SOUNDCLOUD_CLIENT_ID`             |
| `VITE_SOUNDCLOUD_CLIENT_SECRET`  | `SOUNDCLOUD_CLIENT_SECRET`         |
| `VITE_TIDAL_CLIENT_ID`           | `TIDAL_CLIENT_ID`                  |
| `VITE_TIDAL_CLIENT_SECRET`       | `TIDAL_CLIENT_SECRET`              |
| `VITE_MAPS_API_KEY`              | `PUBLIC_MAPS_API_KEY`              |
| `VITE_GOOGLE_OAUTH_CLIENT_ID`    | `PUBLIC_GOOGLE_OAUTH_CLIENT_ID`    |
| `VITE_FACEBOOK_APP_ID`           | `PUBLIC_FACEBOOK_APP_ID`           |
| `VITE_FACEBOOK_APP_SECRET`       | `FACEBOOK_APP_SECRET`              |
| `VITE_reCAPTCHA_SITE_KEY`        | `PUBLIC_RECAPTCHA_SITE_KEY`        |
| `VITE_reCAPTCHA_SECRET_KEY`      | `RECAPTCHA_SECRET_KEY`             |

Unchanged: `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_SPOTIFY_CLIENT_ID`, `NEW_SPOTIPY_*`,
`SPOTIFY_SERVICE_URL`, `SC_API_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_*`, `SPACEMAIL_*`,
`OPEN_AI_API`, `GROK_API_KEY`.

- [ ] Add `ORIGIN=https://www.clubfindr.com`. The CSRF origin check is on
      (`trustedOrigins: ['https://clubfindr.com', 'https://www.clubfindr.com']`); without
      `ORIGIN`, adapter-node assumes `https://<Host header>` and form posts from the
      `www` host get 403 if the proxy rewrites `Host`. `ecosystem.config.cjs` passes the
      whole `.env` to the process, so nothing else is needed.
- [ ] Keep a copy of the old `.env` until the first deploy succeeds.

### Database (before merge)

- [ ] `clubfindr.password_resets` is not in `clubfindr_schema.sql`; if it is missing in
      production too, apply `migrations/20261012_add_password_resets.sql` (password reset
      has been failing without it).
- [ ] Nothing else in the schema changed.

### CI (`.github/workflows/clubfindr-ci.yml`)

- [ ] Node matrix `18.x / 20.x` → `node-version-file: clubfindr/.nvmrc` (Node 24).
- [ ] pnpm: `corepack enable` or `pnpm/action-setup` without a version (it reads
      `packageManager`).
- [ ] Rename the `VITE_PG_*` secrets to `PG_*`; the build needs every key in `.env.example`
      defined (placeholders are fine for most).
- [ ] End-to-end job: `dev/setup.sh` (needs a Postgres service or `initdb`), then
      `pnpm exec playwright install --with-deps chromium`, then `pnpm test`. Upload
      `playwright-report/` on failure.
- [ ] Docs mention `npm run` in places; the scripts are `pnpm` only now.

### First deploy

- [ ] Deploy as usual (`pnpm install --frozen-lockfile`, `pnpm build`,
      `pm2 startOrReload ecosystem.config.cjs --update-env`, `pm2 save`).
- [ ] Smoke: `GET /` 200; log in with a real account; search → `/clubs` and `/barfindr`;
      submit a form (e.g. update-info with a wrong current password → "Invalid current
      password", not 403); a Spotify login round trip (the cookie `secure` flags are now
      derived from the build, not `NODE_ENV`).
- [ ] Watch `~/.pm2/logs/clubfindr-error-0.log` for `Rate limit exceeded` (unchanged
      behaviour, 60/min per `X-Forwarded-For`) and for 403s on form posts.
- [ ] Rollback is the documented `git reset --hard <prev>` + rebuild; the old commit needs
      the old Node on PATH, so keep nvm's Node 18 installed until the new version has run
      for a while.

### After the first deploy

- [ ] Bump `@playwright/test` to the latest (the suite was verified with 1.58.2 because
      that was the newest Chromium available in the upgrade environment).
- [ ] Remove `template.env` references from any notes; `.env.example` is the only template.

## Known issues

Things found during the upgrade and deliberately left alone. None blocks the deploy.

### Behaviour

1. **Date fields use UTC.** The search forms serialise the picked date with
   `toISOString().substring(0, 10)`, which is the UTC date: a search at 00:30 Berlin time
   sends the previous day. Fix by formatting the local date parts.
2. **Spotify token refresh never stores the new expiry** (`spotify/search/+page.server.ts`):
   the refreshed expiry is computed but the `spotifyTokenExpiry` cookie is not updated, so
   every request refreshes again.
3. **`/clubs` and `/promoter-home` return 500 when opened without the expected cookies**
   (no city / not logged in). They should redirect to `/` and `/login/bars`.
4. **`/bars` without the Spotify flow has no `barId`**, so creating a bar event posts to
   `/api/bars//events` (404). The dashboard assumes Spotify has been connected.
5. **Rate limiter is per process memory** and trusts `X-Forwarded-For` as sent; all
   clients without the header share the `unknown` bucket.
6. **Password reset e-mails hard-code `https://www.clubfindr.com`** instead of `ORIGIN`.

### Code health

7. **Colour classes outside the palette** (`text-gray-700`, `bg-blue-500`, … 174 uses).
   They generate no Tailwind CSS; `app.css` themes through attribute selectors on the class
   names (`[class*='bg-gray-']`, `[class*='text-']`). Replacing that with real palette
   tokens is a design refactor; until then the names must stay.
8. **`.feature-icon` colour on the home page** was never applied (the old variable held an
   RGB triplet). Left as it renders; `color: rgb(var(--rgb-secondary))` would colour it.
9. **Legacy-syntax dependencies**: `date-picker-svelte` and `lucide-svelte` are Svelte 4
   style components (excluded from forced runes mode). Fine, but they will not move to
   Svelte 6 without updates.
10. **`jsonwebtoken` on Node 26** crashes (`buffer-equal-constant-time` needs the removed
    `SlowBuffer`); Node 24 is LTS until April 2028, so this only matters for the next Node
    bump (swap to `jose` or patch the dependency).
11. **`src/routes/api/spotify/artists/+page.svelte`** is a stub page living next to an API
    endpoint; `src/stores/genres.svelte.ts` is only read by it and never written.
12. **`hooks.server.ts` logs every non-asset request** and the login endpoint logs request
    shapes; noisy in `pm2 logs`.
13. **SvelteKit 3** is still prerelease (`3.0.0-next.*`); revisit when it ships.
14. **`svelte/no-navigation-without-resolve` and `svelte/prefer-svelte-reactivity`** are
    off in `eslint.config.js` (moot with an empty base path / false positives on local
    temporaries). Re-evaluate if either assumption changes.
