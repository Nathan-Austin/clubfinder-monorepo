# Production

Production runs on a single Ubuntu 24.04 server from a checkout at
`/home/nathan/clubfinder`, as user `nathan`. All paths in `deploy/` are
hardcoded to that location. Every component reads its secrets from a
gitignored `.env` in its own directory (see the `.env.example` next to it).

## Services

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

## Firewall

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

Toolchain: Node 24 via nvm, reached through the symlink `~/.local/node24` (clubfindr
pins the major in `.nvmrc`/`engines`, and `ecosystem.config.cjs` pins the interpreter;
see `clubfindr/docs/PRODUCTION_HANDOVER.md` for the move from 18.19.1, which stays
installed for rollback). pnpm comes from Node 24's corepack (`~/.local/node24/bin/pnpm`,
version from `packageManager`). PM2 5.4.2 is installed globally with pnpm
(`~/.local/share/pnpm`). The server is ARM64, and the interactive shell defaults to
nvm's Node 26, so neither PM2 nor the right pnpm is on the default PATH:

```bash
export PATH=/home/nathan/.local/share/pnpm:/home/nathan/.local/node24/bin:$PATH
```

## Installing from the repo

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

# let the deploy workflow restart the six services (and nothing else)
sudo install -m 0440 -o root -g root deploy/sudoers/clubfinder-deploy /etc/sudoers.d/clubfinder-deploy
sudo visudo -cf /etc/sudoers.d/clubfinder-deploy
```

The spotify_service venv lives outside the repo at `~/spotify_service_env`
(`python -m venv ~/spotify_service_env && ~/spotify_service_env/bin/pip install -r spotify_service/requirements.txt`).
barfindr uses the conda `base` environment with `barfindr/requirements.txt`.
spotify_service also needs `spotify_service/app_info.json` (see `app_info.example.json`).

## Restarting

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

## Deploys

**Pushing to `main` deploys to production** once Main CI passes for that commit
(`.github/workflows/deploy.yml`). The workflow SSHes in as `nathan` and runs
`deploy/deploy.sh <sha>` from the commit being deployed. That script:

1. Refuses to run if the checkout is not on `main`, has uncommitted changes to
   tracked files, or the commit is not a fast-forward.
2. **Fails before changing anything if a `requirements*.txt` changed** in
   barfindr, data_collection or spotify_service. Python packages are installed
   by hand; the error message lists the commands.
3. Checks it can restart the units it will need (passwordless sudo from
   `deploy/sudoers/clubfinder-deploy`), then fast-forwards the checkout.
4. Redeploys only components whose code changed (changes to `*.md`,
   `.env.example` and `docs/` are ignored):
   - clubfindr: `pnpm install --frozen-lockfile`, `pnpm build`,
     `pm2 startOrReload ecosystem.config.cjs --update-env`, `pm2 save`, then
     `GET 127.0.0.1:3000/` must return 200.
   - barfindr / spotify_service: restart the three units, then each must be
     active and not restarted again 10 s later; the spotify API must answer.
   - data_collection: nothing to restart (cron).
5. Never applies `deploy/` files (units, nginx, cron, ufw, sudoers); it lists
   changed ones so you can install them by hand.

Deploys run one at a time. If one fails, the job fails with a `DEPLOY FAILED:`
line; the log prints the previous commit for rollback
(`git reset --hard <prev>` on the server, then rebuild/restart as above).
Test locally with `DRY_RUN=1 deploy/deploy.sh <sha>`.

## Logs

| Component | Location |
|---|---|
| clubfindr | `~/.pm2/logs/clubfindr-out-0.log`, `~/.pm2/logs/clubfindr-error-0.log` (`pm2 logs clubfindr`) |
| systemd services | journald: `sudo journalctl -u <unit> -f` (`nathan` is not in `adm`/`systemd-journal`, so sudo is needed) |
| spotify_service | also files in `spotify_service/`: `cleanup.log`, `stream_errors.log`, `spotify_service.log` (rotating) |
| data_collection | `data_collection/logs/`; cron output in `~/cron.log`. `cleanup_logs.sh` clears logs older than 14 days or over 10 MB weekly |
| nginx | `/var/log/nginx/` |
| PostgreSQL | `/var/log/postgresql/postgresql-16-main.log` |

## Scheduled jobs

- `data_collection/run_data_collection.sh`: daily 04:00, **currently disabled**
  (commented out) because the event fetcher has been broken since Aug 2025.
- `data_collection/cleanup_logs.sh`: Sundays 00:00.
