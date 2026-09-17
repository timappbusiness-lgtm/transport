#!/usr/bin/env bash
# Sample transport requests for a local or preview database.
#
#   pnpm seed:requests
#
# NEVER run this against the production project. Every row it writes carries
# the word "DEMO" in its title, and the script refuses to run if the database
# already holds cargo listings that are not demo rows — which is the cheapest
# available proxy for "this looks like production".
#
# Connection settings come from the usual PG* environment variables.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
db="${PGDATABASE:-postgres}"

psql_run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

real_rows="$(psql_run -t -A -c "
  select count(*) from public.cargo_listings
  where coalesce(title, '') not like '%DEMO%'
" 2>/dev/null || echo "error")"

if [[ "$real_rows" == "error" ]]; then
  echo "Could not read public.cargo_listings. Is the schema applied?" >&2
  exit 1
fi

if [[ "$real_rows" != "0" ]]; then
  echo "Refusing to seed: ${real_rows} request(s) already exist that are not demo rows." >&2
  echo "This looks like a real database. Seed only a throwaway one." >&2
  exit 1
fi

psql_run -f "$root/supabase/seed/requests.sql"
echo "Seeded demo requests into ${db}."
