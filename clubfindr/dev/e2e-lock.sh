#!/usr/bin/env bash
# One e2e run at a time on this machine, across every checkout and worktree.
#
#   dev/e2e-lock.sh run <command...>   claim the lease (or refresh our own) and run the command
#   dev/e2e-lock.sh status             who holds the lease, and how long ago it was last used
#   dev/e2e-lock.sh release            give the lease up (only the holder can)
#   dev/e2e-lock.sh check              exit 75 if another checkout holds it (used by setup.sh)
#
# Every checkout shares one dev database (clubfindr_dev on 54329, which dev/setup.sh wipes)
# and ports 4173-4178, and a run takes enough memory that two at once can exhaust the machine.
# A run is several commands (setup, the suite or chunks of it, the second flag mode), so a
# lock held for one command is not enough: the lease names the checkout that holds it and lasts
# across commands. Each `run` refreshes it, `release` ends it, and it expires after
# E2E_LEASE_MINUTES (default 20) without a `run`, so a session that died cannot block the
# others. Keep every command shorter than that, or the lease can lapse mid-command.
#
# When another checkout holds the lease, `run` refuses with exit code 75 and names it: wait
# and try again later. It never blocks, so a foreground caller is never left hanging.
#
# The lease lives in the git directory all worktrees share, not /tmp, which a sandbox can make
# private. flock guards claiming it, so two checkouts cannot both win.

set -euo pipefail

LEASE_MINUTES="${E2E_LEASE_MINUTES:-20}"

die() {
	echo "e2e-lock: $*" >&2
	exit 1
}

COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) ||
	die "not inside a git checkout"
ME=$(git rev-parse --show-toplevel)
LOCK_FILE="$COMMON_DIR/clubfinder-e2e.lock"
LEASE_FILE="$COMMON_DIR/clubfinder-e2e.lease"

# Lease file: one line, "<checkout path> <branch> <epoch seconds of the last run>".
holder=""
holder_branch=""
holder_at=0

read_lease() {
	holder=""
	holder_branch=""
	holder_at=0
	[ -s "$LEASE_FILE" ] || return 0
	read -r holder holder_branch holder_at <"$LEASE_FILE" || true
	[[ "$holder_at" =~ ^[0-9]+$ ]] || holder_at=0
}

# The lease counts only while it is fresh; an expired one is as good as none.
lease_is_live() {
	[ -n "$holder" ] && [ $(($(date +%s) - holder_at)) -lt $((LEASE_MINUTES * 60)) ]
}

describe_holder() {
	local age=$(($(date +%s) - holder_at))
	echo "$(basename "$holder") ($holder_branch), last used $((age / 60))m$((age % 60))s ago"
}

write_lease() {
	local branch
	branch=$(git rev-parse --abbrev-ref HEAD)
	printf '%s %s %s\n' "$ME" "$branch" "$(date +%s)" >"$LEASE_FILE.tmp"
	mv "$LEASE_FILE.tmp" "$LEASE_FILE"
}

# Take the guard lock on fd 9. `check` only reads, so it works without flock (macOS has none).
lock() {
	command -v flock >/dev/null 2>&1 || die "flock not found (util-linux)"
	exec 9>"$LOCK_FILE"
	flock -w 10 9
}

# Claim or refresh the lease under flock; fails with 75 if another checkout holds it.
claim() {
	lock || die "could not take $LOCK_FILE within 10s"
	read_lease
	if lease_is_live && [ "$holder" != "$ME" ]; then
		echo "e2e-lock: the e2e lease is held by $(describe_holder)." >&2
		echo "e2e-lock: wait for it to be released (dev/e2e-lock.sh status), then try again." >&2
		exit 75
	fi
	if [ "$holder" != "$ME" ]; then
		if [ -n "$holder" ]; then
			echo "e2e-lock: taking over an expired lease from $(describe_holder)" >&2
		fi
		echo "e2e-lock: lease taken by $(basename "$ME")" >&2
	fi
	write_lease
	flock -u 9
	exec 9>&-
}

# After a command: refresh our lease so a long command does not leave it looking stale. Never
# fails the run, since the command's own exit code is what matters, but says so loudly if the
# lease lapsed and another checkout took it meanwhile: the database may have been reseeded.
refresh_after_run() {
	lock || {
		echo "e2e-lock: warning: could not refresh the lease" >&2
		return 0
	}
	read_lease
	if lease_is_live && [ "$holder" != "$ME" ]; then
		echo "e2e-lock: WARNING: the lease lapsed during the command and $(describe_holder)" >&2
		echo "e2e-lock: took it; its setup may have reseeded the database under this run." >&2
	else
		write_lease
	fi
	flock -u 9
	exec 9>&-
}

case "${1:-}" in
	run)
		shift
		[ $# -gt 0 ] || die "usage: dev/e2e-lock.sh run <command...>"
		claim
		status=0
		"$@" || status=$?
		refresh_after_run
		exit "$status"
		;;
	check)
		read_lease
		if lease_is_live && [ "$holder" != "$ME" ]; then
			echo "e2e-lock: the e2e lease is held by $(describe_holder)." >&2
			exit 75
		fi
		;;
	status)
		read_lease
		if lease_is_live; then
			echo "held by $(describe_holder)"
		elif [ -n "$holder" ]; then
			echo "free (expired lease from $(describe_holder))"
		else
			echo "free"
		fi
		;;
	release)
		lock || die "could not take $LOCK_FILE within 10s"
		read_lease
		if [ "$holder" = "$ME" ]; then
			rm -f "$LEASE_FILE"
			echo "e2e-lock: released by $(basename "$ME")" >&2
		elif lease_is_live; then
			die "not released: held by $(describe_holder), not by $(basename "$ME")"
		else
			rm -f "$LEASE_FILE"
			echo "e2e-lock: nothing held; cleared" >&2
		fi
		;;
	*)
		sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' >&2
		exit 2
		;;
esac
