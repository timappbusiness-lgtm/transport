#!/usr/bin/env bash
# Walks the company lookup end to end and says where it breaks.
#
#   bash scripts/ci/check-anaf.sh
#
# The sign-up form asks `verify-cui-anaf` to look a CUI up at ANAF. When
# that fails the form falls back to manual entry, which is correct — and
# which also means a broken lookup looks exactly like a working one with
# an unlucky CUI. This asks each link of the chain in turn:
#
#   1. ANAF itself, from this runner
#   2. whether the function is deployed on the project, and how
#   3. which function secrets are set (names only, never values)
#   4. the function, called the way a browser on the site would call it
#
# Read-only: no company id is sent, so the function writes nothing, and
# the Supabase CLI calls only list. Environment (all optional; without the
# Supabase ones only step 1 runs):
#   SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF   read by the CLI
#   SITE_ORIGIN    the origin the browser would send (default production)
#   ANAF_TEST_CUI  a real, active CUI (default 14399840)
#
# Never fails the job: it reports. The summary is the result.
set -uo pipefail

cui="${ANAF_TEST_CUI:-14399840}"
origin="${SITE_ORIGIN:-https://transport-seven-sandy.vercel.app}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

say() {
  echo "$1"
  echo "$1" >> "$summary"
}

say "## Company lookup (ANAF)"
say ""

# 1. ANAF, straight from the runner -----------------------------------
today="$(date -u +%F)"
code=$(curl -s -o "$work/anaf.json" -w '%{http_code}' --max-time 25 \
  -X POST -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "[{\"cui\": ${cui}, \"data\": \"${today}\"}]" \
  "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva" || true)
found=$(jq -r '(.found // []) | length' "$work/anaf.json" 2>/dev/null || echo "?")
name=$(jq -r '.found[0].date_generale.denumire // empty' "$work/anaf.json" 2>/dev/null || true)
say "- ANAF v9 from the runner: HTTP \`${code}\`, records found: \`${found}\`${name:+ (${name})}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" || -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  say "- Supabase secrets not available to this run: the project checks are skipped."
  exit 0
fi
ref="$SUPABASE_PROJECT_REF"

# 2. Is the function deployed? ------------------------------------------
if supabase functions list --project-ref "$ref" -o json > "$work/functions.json" 2> "$work/functions.err"; then
  deployed=$(jq -c '[.[] | select(.slug == "verify-cui-anaf") | {status, version, verify_jwt, updated_at}] | first // empty' "$work/functions.json")
  if [[ -n "$deployed" ]]; then
    say "- \`verify-cui-anaf\` on the project: \`${deployed}\`"
  else
    say "- **\`verify-cui-anaf\` is not deployed on the project.** Deployed: \`$(jq -r '[.[].slug] | join(", ")' "$work/functions.json")\`"
  fi
else
  say "- Could not list functions: \`$(head -c 300 "$work/functions.err")\`"
fi

# 3. Which secrets are set (names only) ---------------------------------
if supabase secrets list --project-ref "$ref" -o json > "$work/secrets.json" 2> "$work/secrets.err"; then
  names=$(jq -r '[.[].name] | sort | join(", ")' "$work/secrets.json")
  say "- Function secrets set (names only): \`${names}\`"
  for wanted in ALLOWED_ORIGIN SITE_URL ANAF_ENDPOINT; do
    if jq -e --arg n "$wanted" 'any(.[]; .name == $n)' "$work/secrets.json" > /dev/null; then
      say "  - \`${wanted}\`: set"
    else
      say "  - \`${wanted}\`: **not set**"
    fi
  done
else
  say "- Could not list secrets: \`$(head -c 300 "$work/secrets.err")\`"
fi

# 4. The function, as a browser on the site would call it ---------------
if ! supabase projects api-keys --project-ref "$ref" -o json > "$work/keys.json" 2> "$work/keys.err"; then
  say "- Could not read the project's API keys: \`$(head -c 300 "$work/keys.err")\`"
  exit 0
fi
anon=$(jq -r '[.[] | select(.name == "anon") | .api_key] | first // empty' "$work/keys.json")
if [[ -z "$anon" ]]; then
  say "- The project has no legacy \`anon\` key to call the function with; step 4 skipped."
  exit 0
fi

code=$(curl -s -o "$work/fn.json" -D "$work/fn.headers" -w '%{http_code}' --max-time 30 \
  -X POST "https://${ref}.supabase.co/functions/v1/verify-cui-anaf" \
  -H "apikey: ${anon}" -H "Authorization: Bearer ${anon}" \
  -H 'Content-Type: application/json' -H "Origin: ${origin}" \
  -d "{\"cui\": \"${cui}\"}" || true)
body=$(jq -c '{found, reason, error, legal_name, county, city, is_inactive, is_struck_off}' "$work/fn.json" 2>/dev/null || head -c 300 "$work/fn.json")
allow=$(grep -i '^access-control-allow-origin:' "$work/fn.headers" | tr -d '\r' | cut -d' ' -f2- || true)
say "- The function, called with \`Origin: ${origin}\`: HTTP \`${code}\`, body \`${body}\`"
if [[ -z "$allow" ]]; then
  say "  - No \`Access-Control-Allow-Origin\` in the answer: a browser on ${origin} would be refused. (The app calls the function from the server, where this does not apply.)"
else
  say "  - \`Access-Control-Allow-Origin: ${allow}\`"
fi

exit 0
