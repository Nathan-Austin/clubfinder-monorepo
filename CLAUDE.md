# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clubfinder is a **monorepo** containing a multi-component platform for discovering music events and connecting artists with venues. The system consists of:

1. **clubfindr** (Main SvelteKit web application)
2. **barfindr** (Python venue backend: Celery workers and Spotify sync; no HTTP server)
3. **data_collection** (Python scripts for scraping event data)
4. **spotify_service** (Automated Spotify application management)
5. **app_clubfindr** (React Native/Expo mobile app)

### Monorepo Structure

This repository was migrated from individual repos to a monorepo structure:
- Individual git histories are preserved in `.git-backups/` (local only, not in git)
- GitHub Actions workflows are set up with path filtering for efficient CI
- Each component maintains its own dependencies and can be developed independently

## Database Configuration

The project uses PostgreSQL 16 (system package, cluster `16-main`, port 5432), database `clubfindr`, schema `clubfindr`. Connection details are stored in each component's gitignored `.env` (see its `.env.example`):

```
DATABASE_URL=postgres://<user>:<password>@localhost:5432/clubfindr
```

Main tables include: `events`, `event_artists`, `artists`, `users`, `user_sessions`, `bars`, `spotify_apps`, `venues`

There is no genres or cities table: genres come from the JSON files in `clubfindr/src/lib/data/` (see Genre Classification System below), and the scraped cities from `data_collection/live_cities.txt`.

## Development Commands

### clubfindr (Web Application)

Directory: `/home/nathan/clubfinder/clubfindr`

```bash
# Install dependencies
pnpm install

# Development server (port 3000)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview  # or: pnpm start

# Type checking
pnpm check
pnpm check:watch

# Linting and formatting
pnpm lint
pnpm format

# Testing
pnpm test          # Playwright e2e tests (needs dev/setup.sh first)
pnpm exec vitest run   # Vitest unit tests (pnpm test:unit = watch mode)

# Genre maintenance script
pnpm build-scripts
pnpm genre-maintenance
```

### barfindr (Venue Backend)

Directory: `/home/nathan/clubfinder/barfindr`

```bash
# Install dependencies
pip install -r requirements.txt

# Run the service (initialises services, then idles; no HTTP port)
PYTHONPATH=src python -m src.barfindr.main

# Database migrations
alembic upgrade head
alembic revision --autogenerate -m "migration message"

# Run Celery worker
./run_celery_worker.sh

# Run tests
pytest
pytest tests/specific_test.py
```

### data_collection (Event Scraping)

Directory: `/home/nathan/clubfinder/data_collection`

```bash
# Install dependencies
pip install -r requirements.txt

# Run data collection
./run_data_collection.sh

# Individual scripts
python3 event_fetcher.py
python3 spotipy_search.py
python3 soundcloud_api.py
```

### spotify_service (Spotify App Management)

Directory: `/home/nathan/clubfinder/spotify_service`

```bash
# Service management
./manage_spotify_service.sh start
./manage_spotify_service.sh stop
./manage_spotify_service.sh restart
./manage_spotify_service.sh status
./manage_spotify_service.sh logs
./manage_spotify_service.sh cleanup
./manage_spotify_service.sh process-queue
```

## Architecture

### clubfindr (SvelteKit Web App)

**Tech Stack:** Svelte 5 (runes), SvelteKit 2, TypeScript 6, Tailwind 4, Vite 8, Node 24 (see `clubfindr/README.md`)

**Key Directories:**
- `src/routes/` - File-based routing with +page.svelte, +page.server.ts, +layout.svelte
- `src/routes/api/` - API endpoints organized by feature (artists, bars, mobile, spotify, soundcloud, venues)
- `src/lib/` - Shared utilities and services
- `src/lib/types/` - TypeScript type definitions
- `src/lib/data/` - Genre classification system with genre clustering, blacklist, and maintenance scripts
- `scripts/` - Build and maintenance scripts

**Authentication:**
- Cookie-based sessions stored in `clubfindr.user_sessions` table
- Session management in `src/hooks.server.ts` with in-memory caching and rate limiting
- Auth utilities in `src/lib/authUtils.ts`
- Cookie management in `src/lib/cookieManager.ts`

**Database Access:**
- Direct PostgreSQL access via `src/lib/db.ts` using pg Pool
- All queries use parameterized queries for security
- Connection configured via the PG_* environment variables (`$env/static/private`)

**Key Features:**
- Spotify and SoundCloud integration for artist profiles
- Google Maps integration for venue location
- PDF generation for user reports (pdfUtils.ts)
- Email notifications (email.ts)
- Genre classification system with cosine similarity matching

**Adapter:** Uses `@sveltejs/adapter-node` for Node.js deployment

### barfindr (Venue Backend)

**Tech Stack:** SQLAlchemy, Celery, Redis, Alembic (FastAPI is in requirements.txt but unused)

**Purpose:** Handles venue-specific operations and background tasks

**Key Components:**
- `src/barfindr/main.py` - Service entry point (initialises services, then sleeps in a loop)
- `src/barfindr/database.py` - SQLAlchemy database setup (requires `DATABASE_URL`)
- `src/barfindr/tasks.py` - Celery tasks for async operations
- `src/barfindr/spotify_service.py` - Spotify API integration
- `src/barfindr/encryption.py` - Credential encryption/decryption
- `migrations/` - Alembic database migrations

**Background Tasks:**
- Uses Celery with Redis broker for async task processing
- Scheduled tasks via celery beat (celerybeat-schedule files)

### data_collection (Python Scrapers)

**Purpose:** Scrapes event data from various sources and populates the database

**Key Files:**
- `data_collection.py` - Main orchestration script with lock file management
- `event_fetcher.py` - Fetches events from Resident Advisor and other sources
- `spotipy_search.py` - Spotify API integration for artist data
- `soundcloud_api.py` - SoundCloud API integration
- `utils.py` - Database utilities and table creation queries
- `live_cities.txt` - List of cities to scrape (format: "Name - Code - Country")

**Execution:**
- Uses lock file `/tmp/clubfinder_running.lock` to prevent concurrent runs
- Cleans up past events from database before each run
- Timeouts and error handling for long-running scrapes

### spotify_service (Selenium Automation)

**Purpose:** Automated management of Spotify for Developers applications using browser automation

**Key Features:**
- On-demand browser launching (only opens when needed)
- Queue system for failed operations in `pending_queue/` directory
- Automatic screenshot capture for debugging
- Email notifications for successful operations
- Systemd service integration

**API Endpoints:**
- POST /add_user - Add user to Spotify app
- POST /add_bar - Add bar to Spotify app
- GET /get_credentials/{app_name} - Retrieve app credentials
- POST /process_queue - Process pending queue items
- POST /cleanup - Trigger cleanup process

## Important Development Notes

### Environment Variables

**clubfindr requires:**
- `PG_USERNAME`, `PG_PASSWORD`, `PG_DB`, `PG_HOST`, `PG_PORT` - PostgreSQL connection (all keys in `clubfindr/.env.example` are required at build time; `PUBLIC_*` ones reach the browser)
- Google Maps API key for geocoding
- Spotify and SoundCloud API credentials
- Email credentials for notifications

**barfindr requires** (`barfindr/.env`, loaded by the systemd units):
- `DATABASE_URL` - PostgreSQL connection string (required; no fallback)
- `REDIS_URL` - Celery broker
- `ENCRYPTION_KEY` - for stored Spotify credentials
- `SPOTIFY_REDIRECT_URI`

### Testing

**E2E Tests:** Use Playwright, configured in `playwright.config.ts`, run with `pnpm test`
**Unit Tests:** Use Vitest, run with `pnpm test:unit`

To run a single test file:
```bash
pnpm playwright test tests/specific-test.spec.ts
pnpm vitest src/lib/specific.test.ts
```

### Security Considerations

- CSRF origin check on in `svelte.config.js` (`csrf.trustedOrigins`: clubfindr.com and www); production needs `ORIGIN` set
- Rate limiting implemented in hooks.server.ts (60 requests/minute per IP)
- Blocked paths for common exploit attempts (/.env, /admin, /shell, etc.)
- All database queries use parameterized queries to prevent SQL injection
- Session caching with 5-minute TTL to reduce database load
- Session timeout after 7 days of inactivity

### Genre Classification System

The genre system uses cosine similarity to match raw genres to standardized clusters:
- `src/lib/data/processed_genres.json` - Processed genre mappings
- `src/lib/data/genreClusters.json` - Clustered genre definitions
- `src/lib/data/unified-genres.json` - Final unified genre list
- `src/lib/data/genre-classifier.ts` - Classification logic
- `scripts/genre-maintenance.ts` - Interactive script for processing new genres

When new genres are encountered, they're logged to `missing-genres.txt` for batch processing.

### Database Schema Notes

- Uses UUID primary keys with `gen_random_uuid()`
- All tables are in the `clubfindr` schema
- Artist names are globally unique across all cities
- Events are partitioned by city
- Past events are automatically cleaned up by data_collection.py

### Code Style

- TypeScript with strict mode enabled
- Svelte components use TypeScript
- Tailwind CSS for styling
- ESLint and Prettier configured
- Import paths use `$lib/` alias for `src/lib/`

### Deployment

The clubfindr web app builds to a Node.js server:
- Output directory: `build/`
- Uses `@sveltejs/adapter-node` with precompression enabled
- Preview server runs on port 3000

Production setup (services, ports, restarts, logs) is documented in
`deploy/README.md`; the live systemd units, nginx site and cron lines
are copied in `deploy/`. Summary:
- clubfindr: `node build/index.js` on :3000 under PM2 (`clubfindr/ecosystem.config.cjs`, resurrected at boot by `pm2-nathan.service`)
- spotify_service: `spotify-automation-api` (Flask, :5000, called by clubfindr on 127.0.0.1; routes under `/api/<name>`), `-worker-browser`, `-beat`; venv `~/spotify_service_env`
- barfindr: `barfindr`, `barfindr-celery-worker`, `barfindr-celery-beat`; conda `base`
- Redis and PostgreSQL 16 are system packages; nginx site `sveltekit.config` (clubfindr.com) proxies to :3000 (its `/api/user/` → :5000 block matches no Flask route and is unused)
- Firewall: ufw rules in `deploy/ufw-rules.sh` (80/443 Cloudflare-only)
- Pushing to `main` deploys to production after Main CI passes (`deploy.yml` runs `deploy/deploy.sh`); Python requirements and `deploy/` files are applied by hand

## GitHub Actions CI/CD

The monorepo uses path-based workflow triggering for efficient CI:

### Workflows

1. **main-ci.yml**: Orchestrates all component workflows with path filtering
   - Only runs relevant workflows when files change
   - Uses `dorny/paths-filter` for intelligent path detection

2. **clubfindr-ci.yml**: Web application CI
   - Runs on Node.js 24 (`clubfindr/.nvmrc`), pnpm from `packageManager`
   - Postgres 16 service; `dev/setup.sh` writes `.env` and loads the synthetic seed
   - Executes: lint, type check, unit tests, build, e2e tests (all must pass)
   - Uploads the Playwright report as an artifact on failure
   - Needs no secrets

3. **barfindr-ci.yml**: Backend API CI
   - Runs on Python 3.10 and 3.11
   - Spins up PostgreSQL and Redis services
   - Executes: lint (flake8, black, isort), pytest with coverage
   - Uploads coverage to Codecov

4. **data-collection-ci.yml**: Data scraping validation
   - Runs on Python 3.10 and 3.11
   - Executes: lint, configuration validation, security scan (bandit)

5. **spotify-service-ci.yml**: Automation service validation
   - Runs on Python 3.10 and 3.11
   - Executes: lint, file validation, shellcheck, security scan

6. **app-clubfindr-ci.yml**: Mobile app CI (ready for when app is added)
   - Runs on Node.js 18.x and 20.x
   - Executes: lint, type check, tests, expo-doctor, build preview
   - Optional: Requires `EXPO_TOKEN` secret for building

### Running CI Locally

To test workflows locally before pushing:

```bash
# Lint all components
cd clubfindr && pnpm lint
cd ../barfindr && black --check . && flake8 .
cd ../data_collection && black --check . && flake8 .
cd ../spotify_service && black --check . && flake8 .

# Run tests
cd ../clubfindr && pnpm test && pnpm test:unit
cd ../barfindr && pytest
```

### Workflow Optimization

- Workflows only trigger on changes to their respective directories
- Uses caching for dependencies (pnpm, pip, npm)
- Matrix builds test multiple versions (Python 3.10/3.11; clubfindr runs on Node 24 only)
- Path filtering prevents unnecessary workflow runs
