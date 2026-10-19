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
├── deploy/             # Production deployment (see deploy/README.md)
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

How production is set up, deployed and operated (server, services, deploys, logs, scheduled jobs) is in [`deploy/README.md`](deploy/README.md).

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
- **deploy.yml**: Deploys `main` to production after Main CI passes (see `deploy/README.md`, "Deploys")

Workflows only run when files in their respective directories change, optimizing CI time and resources.

### Required Secrets

Set these in your GitHub repository settings (Settings → Secrets and variables → Actions):

#### For clubfindr:
- None. CI runs a Postgres 16 service and `clubfindr/dev/setup.sh` writes a `.env` with
  local values and placeholders (see `clubfindr/dev/TESTING.md`).

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

- `clubfindr` (previously the `clubfinder` repository)
- `barfindr`
- `data_collection` (previously `event_data_scraper`)
- `spotify_service` (previously `spotify-service`)

Git history from individual repos is backed up in `.git-backups/` (ignored by git).

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Roadmap

Planned work, in order, is in [ROADMAP.md](ROADMAP.md).

## License

MIT, see [LICENSE](LICENSE). The Spotify logo files in
`clubfindr/static/lib/2024-spotify-full-logo/` are Spotify's brand assets: they
are not covered by this license and are subject to Spotify's brand guidelines.

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
