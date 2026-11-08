#!/usr/bin/env bash
# Applies every file in migrations/ to the dev database and checks two things:
#
#   1. Each migration runs without error on a database built from dev/schema.sql, and again
#      on top of itself (they are meant to be idempotent: production gets them by hand,
#      possibly more than once).
#   2. dev/schema.sql already contains everything the migrations create. The catalog of the
#      clubfindr schema (columns, indexes, constraints) is snapshotted before and after; any
#      difference means a migration adds something schema.sql lacks, so the e2e suite (which
#      builds its database from schema.sql) would test a different schema than production.
#
# Limitation: a migration whose objects already exist is a no-op (IF NOT EXISTS), so this does
# not notice schema.sql defining an existing table differently from its migration. Mirror
# migrations into schema.sql verbatim to keep the two in step.
#
#   dev/check-migrations.sh        run after dev/setup.sh (CI does, see clubfindr-ci.yml)
#
# Same connection settings as dev/setup.sh, and only ever on the dev server's port 54329.
set -euo pipefail

DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$DEV_DIR")"
# CHECK_MIGRATIONS_DIR exists only to test this script against a failing migration
MIGRATIONS_DIR="${CHECK_MIGRATIONS_DIR:-$APP_DIR/migrations}"

HOST="${DEV_PG_HOST:-127.0.0.1}"
PORT="${DEV_PG_PORT:-54329}"
DB="${DEV_PG_DB:-clubfindr_dev}"
DBUSER="${DEV_PG_USER:-clubfindr_dev}"
DBPASS="${DEV_PG_PASSWORD:-clubfindr_dev}"

die() {
	echo "check-migrations: $*" >&2
	exit 1
}

# Migrations change the schema, never rows, so a scratch copy on the same dev server is fine
# too (clubfindr_dev_*); port 54329 is what keeps this off any real server.
case "$DB" in clubfindr_dev | clubfindr_dev_*) ;; *) DB_OK=0 ;; esac
[ "${DB_OK:-1}" = 1 ] && [ "$PORT" = 54329 ] ||
	die "refusing to run: only clubfindr_dev (or clubfindr_dev_*) on port 54329 (got '$DB' on $PORT)"
command -v psql >/dev/null 2>&1 || die "psql not found on PATH"

psql_dev() {
	PGPASSWORD="$DBPASS" PGCONNECT_TIMEOUT=5 psql -X -q -v ON_ERROR_STOP=1 \
		-h "$HOST" -p "$PORT" -U "$DBUSER" -d "$DB" "$@"
}

[ "$(psql_dev -tAc 'SELECT current_database()')" = "$DB" ] ||
	die "connected to the wrong database"
[ "$(psql_dev -tAc "SELECT 1 FROM pg_namespace WHERE nspname = 'clubfindr'")" = 1 ] ||
	die "schema clubfindr does not exist; run dev/setup.sh first"

# One line per column, index and constraint of the clubfindr schema, in a stable order
snapshot() {
	psql_dev -tA <<'SQL'
SET search_path = clubfindr;
SELECT kind || ' ' || detail FROM (
	SELECT 'column' AS kind,
	       table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable
	         || ' default=' || coalesce(column_default, '') AS detail
	FROM information_schema.columns WHERE table_schema = 'clubfindr'
	UNION ALL
	SELECT 'index', indexname || ' ' || indexdef
	FROM pg_indexes WHERE schemaname = 'clubfindr'
	UNION ALL
	SELECT 'constraint', conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
	FROM pg_constraint WHERE connamespace = 'clubfindr'::regnamespace
) catalog
ORDER BY 1;
SQL
}

mapfile -t FILES < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | sort)
[ ${#FILES[@]} -gt 0 ] || die "no migrations in $MIGRATIONS_DIR"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

snapshot >"$work/before"

for pass in 1 2; do
	for f in "${FILES[@]}"; do
		echo "==> pass $pass: $(basename "$f")"
		# NOTICEs ("already exists, skipping") are expected; errors stop the run
		PGOPTIONS='-c client_min_messages=warning' psql_dev -f "$f" ||
			die "$(basename "$f") failed on pass $pass (pass 2 checks it is idempotent)"
	done
done

snapshot >"$work/after"

if ! diff -u "$work/before" "$work/after" >"$work/diff"; then
	echo >&2
	echo "dev/schema.sql is missing what these migrations create (- schema.sql, + after migrations):" >&2
	sed -n '3,$p' "$work/diff" | grep -E '^[+-]' >&2 || true
	die "mirror the migration into dev/schema.sql"
fi

echo "==> ${#FILES[@]} migrations apply cleanly and twice, and dev/schema.sql already has all of them"
