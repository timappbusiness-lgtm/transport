#!/usr/bin/env bash
# Runs the database test suites on a throwaway local Postgres database.
#
#   pnpm db:test                 # every migration
#   DB_TEST_MIGRATIONS=9 pnpm db:test   # only the first N migrations
#
# Needs a local Postgres (15+) with contrib, and createdb / psql / dropdb on
# PATH. Connection settings come from the usual PG* environment variables.
# The database is always dropped, including when a suite fails.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
db="coridor_test_$(date +%s)_$$"

cleanup() { dropdb --if-exists "$db" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql_run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }

createdb "$db"
psql_run -f "$root/supabase/tests/supabase_shim.sql" >/dev/null

migrations=("$root"/supabase/migrations/*.sql)
if [[ -n "${DB_TEST_MIGRATIONS:-}" ]]; then
  migrations=("${migrations[@]:0:$DB_TEST_MIGRATIONS}")
fi
for f in "${migrations[@]}"; do
  if ! out="$(psql_run -f "$f" 2>&1)"; then
    echo "Migration failed: $(basename "$f")"
    echo "$out" | grep -E "ERROR|DETAIL|HINT|CONTEXT|LINE" || echo "$out"
    exit 1
  fi
done
echo "Applied ${#migrations[@]} migrations to $db"

suites=("${DB_TEST_SUITES:-smoke rls security}")
status=0
for suite in ${suites[@]}; do
  echo
  echo "== ${suite}_test.sql"
  if ! psql_run ${DB_TEST_VERBOSE:+-v verbose=1} -f "$root/supabase/tests/${suite}_test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|INFO):  //'; then
    status=1
  fi
done
exit $status
