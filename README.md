# Clubfinder Monorepo

A comprehensive platform for discovering music events and connecting artists with venues.

## Repository Structure

This is a monorepo containing all Clubfinder components:

```
clubfinder/
├── clubfindr/           # Main SvelteKit web application
├── barfindr/           # Python venue backend (Celery workers + Spotify sync)
├── data_collection/    # Python scripts for event data scraping
├── spotify_service/    # Automated Spotify app management service
├── app_clubfindr/      # React Native/Expo mobile application
├── deploy/             # Production systemd units, nginx site, cron lines
├── .github/            # GitHub Actions CI/CD workflows
└── CLAUDE.md          # Development guide for Claude Code
```

## Quick Start

### Prerequisites

- **Node.js** 18+ and pnpm (for clubfindr and app_clubfindr)
- **Python** 3.10+ (for barfindr, data_collection, spotify_service)
- **PostgreSQL** 15+
- **Redis** 7+ (for barfindr background tasks)

### Database Setup

```bash
# Create PostgreSQL database
createdb clubfindr

# Set up environment variables: copy each component's .env.example to .env
export DATABASE_URL="postgres://your-db-user:your-db-password@localhost:5432/clubfindr"
```

### Running Components

Each component can be run independently:

#### clubfindr (Web App)
```bash
cd clubfindr
pnpm install
pnpm dev  # Runs on http://localhost:3000
```

#### barfindr (Venue Backend)
```bash
cd barfindr
pip install -r requirements.txt
alembic upgrade head   # needs DATABASE_URL set
PYTHONPATH=src python -m src.barfindr.main        # service init loop (no HTTP port)
./run_celery_worker.sh                            # Celery worker
```

#### data_collection (Event Scraping)
```bash
cd data_collection
pip install -r requirements.txt
./run_data_collection.sh
```

#### spotify_service (Spotify Automation)
```bash
cd spotify_service
./manage_spotify_service.sh install
./manage_spotify_service.sh start
```

#### app_clubfindr (Mobile App)
```bash
cd app_clubfindr
npm install
npx expo start
```

## Production

Production runs on a single Ubuntu 24.04 server from a checkout at
`/home/nathan/clubfinder`, as user `nathan`. All paths in `deploy/` are
hardcoded to that location. Every component reads its secrets from a
gitignored `.env` in its own directory (see the `.env.example` next to it).

### Services

| Service | Port | Runs as | Started by |
|---|---|---|---|
| nginx | 80, 443 | system package | `nginx.service`; site `deploy/nginx/sveltekit.config` → `/etc/nginx/sites-available/`, symlinked in `sites-enabled/`. TLS via certbot (`/etc/letsencrypt/live/clubfindr.com/`) |
| clubfindr (SvelteKit) | 3000 | `node build/index.js` under PM2 | `pm2-nathan.service` runs `pm2 resurrect` at boot; process defined in `clubfindr/ecosystem.config.cjs` |
| spotify_service API (Flask) | 5000 | `~/spotify_service_env` venv | `spotify-automation-api.service` |
| spotify_service Celery worker | – | `~/spotify_service_env` venv | `spotify-automation-worker-browser.service` (queues `spotify_browser,spotify_fast,spotify_maintenance`, concurrency 1) |
| spotify_service Celery beat | – | `~/spotify_service_env` venv | `spotify-automation-beat.service` |
| barfindr | – | conda `base` (`~/anaconda3`) | `barfindr.service` (`python -m src.barfindr.main`: initialises services, then idles; no HTTP port) |
| barfindr Celery worker | – | conda `base` | `barfindr-celery-worker.service` → `barfindr/run_celery_worker.sh` (queues `celery,spotify,maintenance`) |
| barfindr Celery beat | – | conda `base` | `barfindr-celery-beat.service` |
| PostgreSQL 16 | 5432 | system package `postgresql-16`, cluster `16-main` | `postgresql@16-main.service`; database `clubfindr`, schema `clubfindr` |
| Redis 7 | 6379 (localhost) | system package `redis-server` | `redis-server.service`; Celery broker for both Python services |
| Cron | – | user `nathan` crontab | lines in `deploy/cron/clubfinder.crontab` |

nginx sends everything (including `/api/spotify/`) to clubfindr on :3000.
clubfindr calls the spotify_service API directly on `127.0.0.1:5000`, whose
routes all live under `/api/<name>` (e.g. `/api/add_user`). The nginx
`location /api/user/` block also proxies to :5000, but no Flask route sits under
that prefix and nothing calls it, so it is unused.

### Firewall

ufw denies incoming traffic by default. `deploy/ufw-rules.sh` recreates the
rules (order matters; ufw uses the first match):

| Port | Rule |
|---|---|
| 22 | open |
| 80, 443 | Cloudflare IP ranges only; the site is only reachable through Cloudflare |
| 3000 | open to anyone, so node can be reached directly, bypassing nginx and Cloudflare |
| 5000 | no rule (default deny); local callers only |
| 5432 | 127.0.0.1 and the Docker networks 172.17.0.0/16 and 172.30.0.0/16; denied otherwise |

Postgres itself (`pg_hba.conf`) also accepts md5 logins for any user and database
from those two Docker networks.

Toolchain: Node 18.19.1 via nvm (`~/.nvm/versions/node/v18.19.1`), PM2 5.4.2
installed globally with pnpm (`~/.local/share/pnpm`). PM2 is not on the
default PATH:

```bash
export PATH=/home/nathan/.local/share/pnpm:/home/nathan/.nvm/versions/node/v18.19.1/bin:$PATH
```

### Installing from the repo

```bash
# systemd units
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now spotify-automation-api spotify-automation-beat \
  spotify-automation-worker-browser barfindr barfindr-celery-worker barfindr-celery-beat

# nginx
sudo cp deploy/nginx/sveltekit.config /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/sveltekit.config /etc/nginx/sites-enabled/
sudo certbot --nginx -d clubfindr.com -d www.clubfindr.com
sudo nginx -t && sudo systemctl reload nginx

# clubfindr under PM2
cd clubfindr && pnpm install && pnpm build
pm2 start ecosystem.config.cjs && pm2 save
sudo systemctl enable pm2-nathan   # or: pm2 startup systemd

# cron: merge deploy/cron/clubfinder.crontab into `crontab -e`

# firewall
sudo bash deploy/ufw-rules.sh
```

The spotify_service venv lives outside the repo at `~/spotify_service_env`
(`python -m venv ~/spotify_service_env && ~/spotify_service_env/bin/pip install -r spotify_service/requirements.txt`).
barfindr uses the conda `base` environment with `barfindr/requirements.txt`.
spotify_service also needs `spotify_service/app_info.json` (see `app_info.example.json`).

### Restarting

```bash
# clubfindr: env vars are baked in at build time, so rebuild after changing .env
cd clubfindr && pnpm build && pm2 restart clubfindr

# Python services
sudo systemctl restart barfindr barfindr-celery-worker barfindr-celery-beat
sudo systemctl restart spotify-automation-api spotify-automation-worker-browser spotify-automation-beat

# nginx
sudo nginx -t && sudo systemctl reload nginx
```

Status: `pm2 ls`, `systemctl status <unit>`.

### Logs

| Component | Location |
|---|---|
| clubfindr | `~/.pm2/logs/clubfindr-out-0.log`, `~/.pm2/logs/clubfindr-error-0.log` (`pm2 logs clubfindr`) |
| systemd services | journald: `sudo journalctl -u <unit> -f` (`nathan` is not in `adm`/`systemd-journal`, so sudo is needed) |
| spotify_service | also files in `spotify_service/`: `cleanup.log`, `stream_errors.log`, `spotify_service.log` (rotating) |
| data_collection | `data_collection/logs/`; cron output in `~/cron.log`. `cleanup_logs.sh` clears logs older than 14 days or over 10 MB weekly |
| nginx | `/var/log/nginx/` |
| PostgreSQL | `/var/log/postgresql/postgresql-16-main.log` |

### Scheduled jobs

- `data_collection/run_data_collection.sh`: daily 04:00, **currently disabled**
  (commented out) because the event fetcher has been broken since Aug 2025.
- `data_collection/cleanup_logs.sh`: Sundays 00:00.

## Development Workflow

### Working on a Component

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make changes in the relevant component directory

3. Commit your changes:
   ```bash
   git add .
   git commit -m "feat(clubfindr): add new feature"
   ```

4. Push and create a PR:
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Convention

Use conventional commits for better changelog generation:

- `feat(component): description` - New feature
- `fix(component): description` - Bug fix
- `docs(component): description` - Documentation changes
- `style(component): description` - Code style changes
- `refactor(component): description` - Code refactoring
- `test(component): description` - Test changes
- `chore(component): description` - Build/tooling changes

Components: `clubfindr`, `barfindr`, `data_collection`, `spotify_service`, `app_clubfindr`

## CI/CD

### GitHub Actions Workflows

Each component has its own CI workflow:

- **clubfindr-ci.yml**: Builds, tests, and lints the web app
- **barfindr-ci.yml**: Tests and lints the barfindr backend
- **data-collection-ci.yml**: Validates and lints scraping scripts
- **spotify-service-ci.yml**: Validates and lints the automation service
- **app-clubfindr-ci.yml**: Builds and tests the mobile app
- **main-ci.yml**: Orchestrates all workflows with path filtering

Workflows only run when files in their respective directories change, optimizing CI time and resources.

### Required Secrets

Set these in your GitHub repository settings (Settings → Secrets and variables → Actions):

#### For clubfindr:
- `VITE_PG_HOST`
- `VITE_PG_PORT`
- `VITE_PG_DB`
- `VITE_PG_USERNAME`
- `VITE_PG_PASSWORD`

#### For app_clubfindr:
- `EXPO_TOKEN` (optional, for Expo builds)

## Testing

### Run All Tests

```bash
# Web app tests
cd clubfindr && pnpm test && pnpm test:unit

# Backend tests
cd barfindr && pytest

# Note: data_collection and spotify_service currently have validation only
```

### Run Linting

```bash
# Web app
cd clubfindr && pnpm lint

# Python components
cd barfindr && black --check . && flake8 .
cd data_collection && black --check . && flake8 .
cd spotify_service && black --check . && flake8 .
```

## Architecture Overview

### clubfindr (Frontend)
- **Tech**: SvelteKit, TypeScript, Tailwind CSS
- **Purpose**: Main user-facing web application
- **Features**: Event discovery, artist profiles, venue listings, user authentication

### barfindr (Backend)
- **Tech**: SQLAlchemy, Celery, Redis (FastAPI is in requirements.txt but no HTTP server runs)
- **Purpose**: Venue management and background task processing
- **Features**: Async task queue, Spotify integration

### data_collection (Data Pipeline)
- **Tech**: Python, Selenium, Beautiful Soup
- **Purpose**: Scrape event data from various sources
- **Features**: Resident Advisor scraping, artist enrichment, database population

### spotify_service (Automation)
- **Tech**: Python, Selenium, Flask
- **Purpose**: Automated Spotify for Developers app management
- **Features**: On-demand browser automation, queue system, email notifications

### app_clubfindr (Mobile)
- **Tech**: React Native, Expo
- **Purpose**: Mobile application for iOS and Android
- **Features**: Event browsing, user profiles, push notifications

## Migration from Individual Repos

This monorepo was created from individual repositories:

- `clubfindr`: Previously at `git@github.com:Nathan-Austin/clubfinder.git`
- `barfindr`: Previously at `git@github.com:Nathan-Austin/barfindr.git`
- `data_collection`: Previously at `https://github.com/Nathan-Austin/event_data_scraper.git`
- `spotify_service`: Previously at `git@github.com:Nathan-Austin/spotify-service.git`

Git history from individual repos is backed up in `.git-backups/` (ignored by git).

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Add your license here]

## Support

For detailed development information, see [CLAUDE.md](./CLAUDE.md).

For component-specific documentation:
- [clubfindr README](./clubfindr/README.md) (if exists)
- [barfindr README](./barfindr/README.md) (if exists)
- [spotify_service README](./spotify_service/README.md)

## Adding the Mobile App

When you have the Expo app ready locally:

```bash
# 1. Copy your expo app into app_clubfindr/
cp -r /path/to/your/expo/app/* app_clubfindr/

# 2. Verify the structure
ls app_clubfindr/  # Should see package.json, app.json, etc.

# 3. Install dependencies
cd app_clubfindr && npm install

# 4. Test it runs
npx expo start

# 5. Commit the app
cd ..
git add app_clubfindr/
git commit -m "feat(app_clubfindr): add mobile application"
git push
```

The CI workflow is already set up and will automatically run tests when you add the app!
