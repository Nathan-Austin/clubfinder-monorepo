# Clubfindr

The Clubfindr web app: discover clubs and bars by the music you listen to, plus the
dashboards for bar managers and promoters and the JSON API used by the mobile app.

## Stack

| Layer      | Version                                                     |
| ---------- | ----------------------------------------------------------- |
| Runtime    | Node 24 (`.nvmrc`, enforced by `engines`), pnpm 10.34.6     |
| Framework  | Svelte 5 (runes everywhere), SvelteKit 2.70, adapter-node 5 |
| Build      | Vite 8, TypeScript 6                                        |
| Styling    | Tailwind 4 via `@tailwindcss/vite`, theme in `src/app.css`  |
| Quality    | ESLint 10 (flat config), Prettier 3, svelte-check 4         |
| Tests      | Vitest 5 (unit), Playwright (end-to-end, `tests/`)          |
| Data       | PostgreSQL 16, schema `clubfindr`, accessed with `pg`       |
| Production | `node build/index.js` under PM2 behind nginx                |

`svelte.config.js` forces runes mode for every component, so legacy Svelte syntax is a
compile error. `pnpm check` and `pnpm lint` are clean (0 errors, 0 warnings).

## Getting started

```bash
nvm install            # or any Node 24
corepack enable        # provides pnpm 10.34.6 from package.json#packageManager
pnpm install
dev/setup.sh           # local Postgres with seed data + .env (see dev/TESTING.md)
pnpm dev               # http://localhost:3000
```

`dev/setup.sh` needs Postgres binaries or Docker; `dev/TESTING.md` covers the options, the
test logins, what works without external services, and the end-to-end suite.

## Commands

| Command                                         | What it does                                                    |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                                      | Vite dev server on :3000                                        |
| `pnpm build`                                    | production build into `build/` (adapter-node)                   |
| `pnpm preview`                                  | serve the build on :3000                                        |
| `pnpm start`                                    | `node build/index.js` (what PM2 runs)                           |
| `pnpm lint`                                     | Prettier check + ESLint                                         |
| `pnpm format`                                   | Prettier write                                                  |
| `pnpm check`                                    | `svelte-kit sync` + svelte-check                                |
| `pnpm exec vitest run`                          | unit tests (`pnpm test:unit` is watch mode)                     |
| `pnpm test`                                     | Playwright end-to-end tests against the seeded database         |
| `pnpm build-scripts`                            | compile `scripts/` to `dist-scripts/` (genre maintenance tools) |
| `pnpm genre-maintenance`, `pnpm convert-genres` | run those tools                                                 |

## Configuration

Copy `.env.example` to `.env` (or let `dev/setup.sh` write one). Every value is read through
SvelteKit's `$env/static/*` modules, so it is fixed at build time: rebuild after changing
`.env`, and every key must be present.

- `PUBLIC_*` values are shipped to the browser (Maps key, Google/Facebook app ids, reCAPTCHA
  site key, Spotify redirect URIs). Everything else stays on the server and the build fails
  if client code imports it.
- `ORIGIN` (production only) is the public origin behind nginx; the CSRF check and absolute
  URLs depend on it.
- `PG_*` is the database, `JWT_SECRET`/`CRYPTO_KEY` sign and encrypt sessions and tokens,
  the rest are third-party credentials.

## Layout

```
src/routes/        pages (+page.svelte), server loads/actions, API endpoints under api/
src/lib/           server utilities: db, auth, sessions, e-mail, PDF, Spotify/SoundCloud/Tidal
src/lib/data/      genre clusters and the genre classifier
src/stores/        shared runes state (genres.svelte.ts)
src/app.css        Tailwind import, @theme (palette, fonts, animation), base styles
tests/             Playwright suite and fixtures
dev/               local database setup, schema, seed, TESTING.md
migrations/        SQL migrations to apply by hand
scripts/           genre maintenance tools (compiled to dist-scripts/)
docs/              design notes and PRODUCTION_HANDOVER.md
```

## Production

See `docs/PRODUCTION_HANDOVER.md` for the checklist to move a server from the previous
(Node 18, Svelte 4) deployment to this version, and the list of known issues.
