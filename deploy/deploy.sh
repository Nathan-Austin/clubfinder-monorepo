#!/bin/bash
# Production deploy for the clubfinder monorepo.
#
# Run on the server by .github/workflows/deploy.yml after Main CI passes on
# main, with the commit CI tested as the only argument:
#
#     deploy/deploy.sh <commit-sha>
#
# DRY_RUN=1 prints what would happen without merging, building or restarting.
# DEPLOY_REPO=<path> runs against another checkout (for testing).
#
# What it does:
#   - refuses to run on a dirty or non-main checkout, or a non-fast-forward
#   - fails before touching anything if a requirements*.txt changed: Python
#     packages are installed by hand, then the deploy is finished with
#     REQUIREMENTS_INSTALLED=1 (the failure message prints the exact commands)
#   - fast-forwards the checkout to the commit
#   - redeploys only components whose code changed (docs and .env.example
#     changes are ignored): clubfindr is rebuilt and reloaded under PM2,
#     barfindr / spotify_service units are restarted and health-checked
#   - never installs systemd units, nginx, cron or firewall changes from
#     deploy/; it prints a reminder to apply them by hand
set -euo pipefail

TARGET="${1:?usage: deploy.sh <commit-sha>}"
DRY_RUN="${DRY_RUN:-0}"

REPO="${DEPLOY_REPO:-/home/nathan/clubfinder}" # override only for testing
# Same node that PM2 runs clubfindr with (ecosystem.config.cjs `interpreter`).
# ~/.local/node24 is a symlink to the nvm install, so a Node patch update only
# re-points the link.
NODE_DIR=/home/nathan/.local/node24
export PATH="$NODE_DIR/bin:/usr/local/bin:/usr/bin:/bin"
# Corepack shim: runs the pnpm pinned in clubfindr/package.json `packageManager`
PNPM="$NODE_DIR/bin/pnpm"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
PM2=/home/nathan/.local/share/pnpm/pm2
SYSTEMCTL=/usr/bin/systemctl

BARFINDR_UNITS=(barfindr.service barfindr-celery-worker.service barfindr-celery-beat.service)
SPOTIFY_UNITS=(spotify-automation-api.service spotify-automation-worker-browser.service spotify-automation-beat.service)

log() { echo "=== $*"; }
fail() {
	echo "DEPLOY FAILED: $*" >&2
	exit 1
}
run() {
	if [ "$DRY_RUN" = 1 ]; then
		echo "[dry-run] $*"
	else
		"$@"
	fi
}

cd "$REPO"

# --- Preflight: nothing below changes the server until all checks pass ---

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || fail "checkout is not on main"
[ -z "$(git status --porcelain --untracked-files=no)" ] ||
	fail "checkout has uncommitted changes to tracked files; resolve them first"
git cat-file -e "${TARGET}^{commit}" 2>/dev/null || fail "commit $TARGET not found (was it fetched?)"
TARGET=$(git rev-parse "$TARGET")
PREV=$(git rev-parse HEAD)

if git merge-base --is-ancestor "$TARGET" "$PREV"; then
	log "Already at or past ${TARGET:0:7} (server is at ${PREV:0:7}); nothing to do"
	exit 0
fi
git merge-base --is-ancestor "$PREV" "$TARGET" ||
	fail "${TARGET:0:7} is not a fast-forward of the server's ${PREV:0:7}"

CHANGED=$(git diff --name-only "$PREV" "$TARGET")
log "Deploying ${PREV:0:7} -> ${TARGET:0:7} ($(echo "$CHANGED" | grep -c .) files changed)"

REQS=$(echo "$CHANGED" | grep -E '^(barfindr|data_collection|spotify_service)/(.*/)?requirements[^/]*\.txt$' || true)
if [ -n "$REQS" ] && [ "${REQUIREMENTS_INSTALLED:-0}" != 1 ]; then
	{
		echo "Python requirements changed:"
		echo "$REQS" | sed 's/^/  /'
		echo
		echo "Python packages are installed by hand. Nothing has been deployed; the"
		echo "server is still at ${PREV:0:7}. To finish this deploy, on the server:"
		echo
		echo "  cd $REPO"
		echo "$REQS" | while read -r f; do
			case "$f" in
			spotify_service/*) pip=/home/nathan/spotify_service_env/bin/pip ;;
			*) pip=/home/nathan/anaconda3/bin/pip ;;
			esac
			echo "  $pip install -r <(git show $TARGET:$f)"
		done
		echo "  REQUIREMENTS_INSTALLED=1 bash <(git show $TARGET:deploy/deploy.sh) $TARGET"
	} >&2
	fail "requirements changed; install them manually"
fi

# Docs and env templates never need a redeploy
CODE=$(echo "$CHANGED" | grep -vE '(\.md$|(^|/)\.env\.example$|^docs/)' || true)
changed() { echo "$CODE" | grep -q "^$1/"; }

DO_CLUBFINDR=0 DO_BARFINDR=0 DO_SPOTIFY=0
changed clubfindr && DO_CLUBFINDR=1
changed barfindr && DO_BARFINDR=1
changed spotify_service && DO_SPOTIFY=1

# Check the Node toolchain now, so a missing Node 24 fails before merging
if [ $DO_CLUBFINDR = 1 ]; then
	want=$(git show "$TARGET:clubfindr/.nvmrc" | tr -d '[:space:]')
	[ -x "$NODE_DIR/bin/node" ] ||
		fail "$NODE_DIR/bin/node not found; install Node $want and link it there (README \"Production\")"
	have=$("$NODE_DIR/bin/node" -p 'process.versions.node.split(".")[0]')
	[ "$have" = "$want" ] || fail "$NODE_DIR is Node $have, clubfindr/.nvmrc wants $want"
	[ -x "$PNPM" ] || fail "$PNPM not found; run $NODE_DIR/bin/corepack enable"
fi

# Commands this user may run with sudo without a password, one per line.
# (`sudo -l <cmd>` is not enough: it succeeds for commands that still need a
# password.) sudo -l wraps long entries onto indented continuation lines.
nopasswd_commands() {
	sudo -n -l 2>/dev/null |
		awk '/^    \(/ { if (e) print e; e = $0; next }
		     /^        / { sub(/^ +/, " "); e = e $0; next }
		     END { if (e) print e }' |
		grep 'NOPASSWD:' | sed 's/.*NOPASSWD: *//' | tr ',' '\n' | sed 's/^ *//; s/ *$//'
}

# Check restart permission now, so a missing sudoers rule fails before merging
need_units=()
[ $DO_BARFINDR = 1 ] && need_units+=("${BARFINDR_UNITS[@]}")
[ $DO_SPOTIFY = 1 ] && need_units+=("${SPOTIFY_UNITS[@]}")
if [ ${#need_units[@]} -gt 0 ]; then
	allowed=$(nopasswd_commands)
	for unit in "${need_units[@]}"; do
		echo "$allowed" | grep -qxF "$SYSTEMCTL restart $unit" ||
			fail "no passwordless sudo for '$SYSTEMCTL restart $unit'; install deploy/sudoers/clubfinder-deploy (README \"Production\")"
	done
fi

# --- Deploy ---

log "Fast-forwarding checkout"
run git merge --ff-only --quiet "$TARGET"
echo "Rollback: cd $REPO && git reset --hard ${PREV:0:7}, then rebuild/restart as below"

if [ $DO_CLUBFINDR = 1 ]; then
	log "clubfindr: build and reload"
	cd "$REPO/clubfindr"
	run "$PNPM" install --frozen-lockfile
	run "$PNPM" build
	run "$PM2" startOrReload ecosystem.config.cjs --update-env
	run "$PM2" save
	cd "$REPO"
	if [ "$DRY_RUN" != 1 ]; then
		code=000
		for _ in $(seq 1 10); do
			code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ || true)
			[ "$code" = 200 ] && break
			sleep 3
		done
		[ "$code" = 200 ] || fail "clubfindr health check: GET 127.0.0.1:3000/ returned $code"
		echo "clubfindr OK (HTTP 200)"
	fi
fi

# Restart units, then confirm each is active and has not restarted again
restart_and_check() {
	local unit stamp
	declare -A started
	for unit in "$@"; do
		run sudo -n "$SYSTEMCTL" restart "$unit"
	done
	[ "$DRY_RUN" = 1 ] && return 0
	sleep 3
	for unit in "$@"; do
		started[$unit]=$("$SYSTEMCTL" show "$unit" -p ActiveEnterTimestampMonotonic --value)
	done
	sleep 10
	for unit in "$@"; do
		"$SYSTEMCTL" is-active --quiet "$unit" || fail "$unit is not active"
		stamp=$("$SYSTEMCTL" show "$unit" -p ActiveEnterTimestampMonotonic --value)
		[ "$stamp" = "${started[$unit]}" ] || fail "$unit restarted again after deploy (crash loop?)"
		echo "$unit OK"
	done
}

if [ $DO_BARFINDR = 1 ]; then
	log "barfindr: restart"
	restart_and_check "${BARFINDR_UNITS[@]}"
fi

if [ $DO_SPOTIFY = 1 ]; then
	log "spotify_service: restart"
	restart_and_check "${SPOTIFY_UNITS[@]}"
	if [ "$DRY_RUN" != 1 ]; then
		code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:5000/api/task_status/deploy-healthcheck || true)
		[ "$code" = 200 ] || fail "spotify API health check returned $code"
		echo "spotify API OK (HTTP 200)"
	fi
fi

if changed data_collection; then
	log "data_collection: code updated (cron job, nothing to restart)"
fi

MANUAL=$(echo "$CODE" | grep '^deploy/' | grep -vE '^deploy/deploy\.sh$' || true)
if [ -n "$MANUAL" ]; then
	log "Changed under deploy/ (NOT applied; install by hand, see README \"Production\"):"
	echo "$MANUAL" | sed 's/^/  /'
fi

log "Deploy of ${TARGET:0:7} complete"
