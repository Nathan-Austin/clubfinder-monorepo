# Retiring spotify_service and Spotify connect on the server

ROADMAP section 1 removed per-account and per-venue Spotify connect from the code and retired
`spotify_service`. The repo side is done; this is the server side, done by hand, in order. It
covers the deploy that ships the change (which stops twice, by design), the services, sudoers,
nginx, the leftovers on disk, the destructive schema drop and the Spotify developer dashboard.

Commits: `07ccf4a` … `a5f407f` (web and mobile connect removed, `bars.expires_at` timestamptz,
`spotify_service` retired, the drop migration). Everything below runs on the production server
as `nathan` from `~/clubfinder` unless it says `sudo`.

Steps 1-3 happen **before or during** the deploy, step 4 only once the new code is live, the
rest at any time after. Step 10 (barfindr) is optional and can wait.

## 0. Before you start

- Production already runs with `SPOTIFY_CONNECT_ENABLED=false` (since 2026-11-12), so nothing a
  user does reaches `spotify_service` any more; stopping it does not affect the site.
- Keep a shell open with the current commit for rollback: `git -C ~/clubfinder rev-parse HEAD`.
- One database backup covers both schema steps (3 and 4). Take it now:

  ```bash
  cd ~/clubfinder
  # Same connection the deploy uses, read from clubfindr/.env without sourcing it
  env_val() { sed -n "s/^$1=//p" clubfindr/.env | tail -1 | sed -E "s/^([\"'])(.*)\1\$/\2/"; }
  export PGHOST="$(env_val PG_HOST)" PGPORT="$(env_val PG_PORT)" PGDATABASE="$(env_val PG_DB)" \
         PGUSER="$(env_val PG_USERNAME)" PGPASSWORD="$(env_val PG_PASSWORD)"
  mkdir -p ~/backups && chmod 700 ~/backups
  pg_dump -Fc -n clubfindr -f ~/backups/clubfindr-before-spotify-drop-$(date +%F).dump
  ls -l ~/backups/   # non-empty file
  ```

  Keep the `PG*` variables in this shell; steps 3 and 4 use them. The dump holds user data and
  the Spotify app secrets in `spotify_apps`: keep it in `~/backups` (mode 700), never in the repo.

## 1. Stop spotify_service (before pushing)

The deploy removes its code from the checkout, so stop the units first, while their files exist:

```bash
sudo systemctl disable --now spotify-automation-api spotify-automation-worker-browser spotify-automation-beat
systemctl is-active spotify-automation-api spotify-automation-worker-browser spotify-automation-beat   # inactive x3
ss -ltnp | grep ':5000' || echo "nothing on :5000"
```

Check the site still works: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/` → 200,
and a venue login on https://www.clubfindr.com/login/bars.

## 2. Push, and let the deploy stop for the Python requirements

Push `main` (CI must pass). The deploy (`deploy/deploy.sh` from the new commit) stops first with
**"Python requirements changed"** (barfindr dropped `spotipy`). Nothing has been deployed yet.
Run the printed `pip install -r …` lines (they are no-ops apart from the removed package), and
optionally `~/anaconda3/bin/pip uninstall -y spotipy`. **Do not run the printed resume command
yet**: the next stop needs the order in step 3.

## 3. Apply the safe migrations by hand, then finish the deploy

With `REQUIREMENTS_INSTALLED=1` the deploy would next stop for the migrations, because
`20261113_drop_spotify_connect.sql` (and the changed `20261111_…` file) contain DROP/DELETE.
`MIGRATIONS_APPLIED=1` skips *all* migrations, so apply the three the new code needs now, and keep
the drop for step 4, after the old code has stopped running:

```bash
cd ~/clubfinder
TARGET=<the commit being deployed, as printed by the deploy>
for f in clubfindr/migrations/20261111_finish_earlier_account_deletions.sql \
         clubfindr/migrations/20261113_bars_expires_at_timestamptz.sql \
         clubfindr/migrations/20261113_user_checkins_qr_nullable.sql; do
  psql -v ON_ERROR_STOP=1 --single-transaction -f <(git show "$TARGET:$f") || break
done
psql -tAc "SELECT data_type FROM information_schema.columns
           WHERE table_schema='clubfindr' AND table_name='bars' AND column_name='expires_at'"
# -> timestamp with time zone
psql -tAc "SELECT is_nullable FROM information_schema.columns
           WHERE table_schema='clubfindr' AND table_name='user_checkins' AND column_name='qr_code_id'"
# -> YES

REQUIREMENTS_INSTALLED=1 MIGRATIONS_APPLIED=1 bash <(git show "$TARGET:deploy/deploy.sh") "$TARGET"
```

`20261111` matched 0 rows when it was first applied (2026-11-12); re-running it is harmless.
The deploy then rebuilds clubfindr, restarts barfindr and lists the `deploy/` files that changed
(installed by hand in steps 5-7). It must end with clubfindr answering 200.

Smoke test the new code before going on:

- https://www.clubfindr.com/ loads; no "Connect with Spotify" button.
- Log in as a user and as a venue; the venue dashboard shows events, artists and genres.
- `curl -s https://www.clubfindr.com/api/mobile/config` → `{"spotifyConnectEnabled":false}`.
- Register a test venue on /register and confirm it with the e-mailed code (this was broken
  until `d25f205`; a fresh code must not read as expired).
- `pm2 logs clubfindr --lines 100` shows no `column … does not exist` errors.

## 4. Drop the Spotify tables and columns (after step 3)

Only once the step 3 deploy has finished and the smoke test passed: the old code is gone, and
nothing reads these columns any more. Optionally record what is being dropped first (client ids
are not secret; do not print `client_secret`):

```bash
psql -c "SELECT app_name, client_id, user_count, is_active FROM clubfindr.spotify_apps ORDER BY app_name" \
  > ~/backups/spotify-apps-$(date +%F).txt
psql -tAc "SELECT count(*) FROM clubfindr.users WHERE spotify_user_id IS NOT NULL"   # connected users
```

Then apply it:

```bash
psql -v ON_ERROR_STOP=1 --single-transaction \
  -f <(git show "$TARGET:clubfindr/migrations/20261113_drop_spotify_connect.sql")
psql -tAc "SELECT count(*) FROM information_schema.columns
           WHERE table_schema='clubfindr' AND (column_name LIKE 'spotify\_%' OR column_name IN
           ('music_service','access_token','refresh_token'))"
# -> 1: only artists.spotify_uri (artist data) is left, on purpose
psql -tAc "SELECT to_regclass('clubfindr.spotify_apps'), to_regclass('clubfindr.spotify_task_log')"   # both empty
```

If it fails, nothing changed (single transaction): read the error, fix, re-run. Then repeat the
smoke test and check `pm2 logs clubfindr` and `sudo journalctl -u barfindr-celery-worker -n 50`.

## 5. Remove the units

```bash
sudo rm /etc/systemd/system/spotify-automation-api.service \
        /etc/systemd/system/spotify-automation-worker-browser.service \
        /etc/systemd/system/spotify-automation-beat.service
sudo systemctl daemon-reload && sudo systemctl reset-failed
systemctl list-unit-files 'spotify-automation*'   # 0 unit files listed
```

## 6. Sudoers

The deploy may restart only the three barfindr units now:

```bash
sudo install -m 0440 -o root -g root deploy/sudoers/clubfinder-deploy /etc/sudoers.d/clubfinder-deploy
sudo visudo -cf /etc/sudoers.d/clubfinder-deploy   # parsed OK
sudo -n -l | grep spotify || echo "no spotify rules left"
```

## 7. nginx

The site loses the `location /api/user/` block that proxied to :5000 (no route was ever served
there). Compare first, then install:

```bash
diff /etc/nginx/sites-available/sveltekit.config deploy/nginx/sveltekit.config   # only that block
sudo cp /etc/nginx/sites-available/sveltekit.config ~/backups/sveltekit.config.$(date +%F)
sudo cp deploy/nginx/sveltekit.config /etc/nginx/sites-available/sveltekit.config
sudo nginx -t && sudo systemctl reload nginx
curl -s -o /dev/null -w '%{http_code}\n' https://www.clubfindr.com/            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://www.clubfindr.com/api/user/x  # 404 from the app
```

If the live file differs in more than that block (certbot edits), remove the block by hand
instead of copying the repo file over it.

## 8. Firewall, cron, Redis

- ufw: no change; there was never a rule for 5000. `sudo ufw status numbered | grep 5000` → nothing.
- cron: `crontab -l | grep -i spotify` → nothing expected; remove any line that shows up.
- Redis is shared with barfindr, whose worker also consumes a queue called `spotify`: **never
  `FLUSHDB`/`FLUSHALL`**. spotify_service's queues were `spotify_browser`, `spotify_fast` and
  `spotify_maintenance`; if you know its Redis database, `redis-cli -n <db> del spotify_browser
  spotify_fast spotify_maintenance` clears what is left. Leaving them costs nothing.

## 9. Leftovers on disk, env keys and the Spotify dashboard

The deploy removed the tracked files; untracked ones stay in `~/clubfinder/spotify_service/`
(logs, screenshots, `pending_queue/`, `app_info.json`, `.env.local`) and the venv lives outside the
repo.

```bash
ls -la ~/clubfinder/spotify_service/
```

- **Secrets**: `spotify_service/.env.local` and `app_info.json` hold live credentials
  (KNOWN_ISSUES 33). Deleting the per-user Spotify apps (below) makes the Spotify ones useless;
  the mail credentials in `.env.local` may be shared with other services, so check before
  rotating. Whether to keep a copy is the owner's call; if so, move it into `~/backups` (mode 700).
- Then remove the directory and the venv:
  `rm -rf ~/clubfinder/spotify_service ~/spotify_service_env`.
  `git -C ~/clubfinder status --porcelain` must stay empty (the paths remain in `.gitignore`).
- **Chrome/chromedriver stay**: data_collection still uses Selenium.
- `clubfindr/.env`: these keys are no longer read and can go (a rebuild is not needed for
  unused keys, but the next deploy rebuilds anyway): `PUBLIC_SPOTIFY_REDIRECT_USER_URI`,
  `PUBLIC_SPOTIFY_REDIRECT_BAR_URI`, `SPOTIFY_SERVICE_URL`, `SPOTIFY_CONNECT_ENABLED`. Keep
  `PUBLIC_SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`: that is the one server-side app.
  `barfindr/.env`: `SPOTIFY_REDIRECT_URI` is unused too.
- **Spotify developer dashboard** (https://developer.spotify.com/dashboard): delete the apps
  spotify_service created for user and venue connect (the names in the step 4 list, e.g.
  "Party Recommender …"). **Keep** the server-side app whose client id is
  `PUBLIC_SPOTIFY_CLIENT_ID` in `clubfindr/.env`, and every app data_collection uses
  (`NEW_SPOTIPY_CLIENT_ID`, `SPOTIPY_CLIENT_ID`, and any listed in `SPOTIFY_CREDENTIALS`, in
  `data_collection/.env`). Compare client ids before deleting:
  `grep -hE '^(PUBLIC_SPOTIFY_CLIENT_ID|NEW_SPOTIPY_CLIENT_ID|SPOTIPY_CLIENT_ID)=' clubfindr/.env data_collection/.env | cut -d= -f2`
  (client ids only; do not print the secrets; check `SPOTIFY_CREDENTIALS` by eye for its ids).

## 10. Optional, later: wind down barfindr

barfindr now only refreshes and cleans `bar_genre_profiles` / `bar_genre_aggregates`, which the
retired playback polling filled; nothing writes new rows. Matching still reads those tables as
one venue source, so do this only once they are empty:

```bash
psql -tAc "SELECT (SELECT count(*) FROM clubfindr.bar_genre_profiles),
                  (SELECT count(*) FROM clubfindr.bar_genre_aggregates)"   # both 0
sudo systemctl disable --now barfindr-celery-beat barfindr-celery-worker barfindr
sudo rm /etc/systemd/system/barfindr.service /etc/systemd/system/barfindr-celery-worker.service \
        /etc/systemd/system/barfindr-celery-beat.service
sudo systemctl daemon-reload && sudo systemctl reset-failed
```

Before the next deploy that touches `barfindr/`, the repo needs the matching change (deploy.sh
still restarts these units and checks their sudoers lines; ROADMAP section 7 tracks retiring the
component). Redis can go too once barfindr is stopped and nothing else uses it.

## Rollback

- **Before step 4** (code deployed, schema intact): `git -C ~/clubfinder reset --hard <previous
  commit>`, rebuild clubfindr (`cd clubfindr && pnpm install --frozen-lockfile && pnpm build &&
  pm2 startOrReload ecosystem.config.cjs --update-env`), and, only if per-user connect has to come back, restore the
  three unit files from git (`git show <previous commit>:deploy/systemd/<unit>`), the venv and
  `app_info.json`, then `sudo systemctl enable --now` them. `bars.expires_at` as timestamptz works
  with the old code too.
- **After step 4**: the old code needs the dropped columns. Restore them from the step 0 dump
  (`pg_restore` into a scratch database, then copy the tables/columns back), or restore the whole
  schema in a maintenance window: `pg_restore --clean -n clubfindr -d "$PGDATABASE" <dump>`, which
  also loses everything written since the dump. Prefer fixing forward.
