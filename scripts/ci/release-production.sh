#!/usr/bin/env bash
# Deploys `main` to Vercel production and waits until production serves the
# commit this run released.
#
#   bash scripts/ci/release-production.sh https://transport-seven-sandy.vercel.app <commit-sha>
#
# Needs VERCEL_DEPLOY_HOOK_URL, a Vercel deploy hook on branch `main`. A hook
# rather than an account token: it can do exactly one thing, rebuild `main`,
# and nothing else on the Vercel account.
#
# A hook builds whatever `main` is when Vercel starts, not a named commit. So
# a run whose commit is no longer the head of `main` does not call it: the
# newer commit's run is queued behind this one (concurrency: main-release)
# and deploys once its own migrations are in.
#
# Production names its commit in the x-coridor-commit header, set in
# next.config.ts from VERCEL_GIT_COMMIT_SHA.
set -euo pipefail

url="${1:?usage: release-production.sh <production-url> <commit-sha>}"
sha="${2:?usage: release-production.sh <production-url> <commit-sha>}"
url="${url%/}"
timeout="${RELEASE_TIMEOUT_SECONDS:-1200}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

served() {
  { curl -s -o /dev/null -D - --max-time 30 "${url}/" || true; } \
    | tr -d '\r' \
    | awk 'tolower($1) == "x-coridor-commit:" { print $2 }'
}

head=$(git ls-remote origin refs/heads/main | cut -f1)
if [[ "$head" != "$sha" ]]; then
  {
    echo '## Production'
    echo
    echo "Not deployed from this run: \`main\` has moved on to \`${head:0:7}\`, whose own run deploys it after its migrations."
  } >> "$summary"
  exit 0
fi

before=$(served)
curl -fsS -X POST -o /dev/null "$VERCEL_DEPLOY_HOOK_URL"
echo "Deploy hook called for ${sha:0:7}; production was serving ${before:-an unknown commit}."

if [[ "$before" == "$sha" ]]; then
  # A re-run of a commit that is already live: the rebuild is identical, and
  # there is no switch to wait for.
  echo "Production already serves ${sha:0:7}."
else
  deadline=$(( SECONDS + timeout ))
  while :; do
    now=$(served)
    [[ "$now" == "$sha" ]] && break
    if [[ -n "$now" && "$now" != "$before" ]]; then
      echo "::error::Production switched to ${now:0:7} instead of ${sha:0:7}: a newer push reached Vercel first. Its own run redeploys after its migrations." >&2
      exit 1
    fi
    if (( SECONDS >= deadline )); then
      echo "::error::Production still serves ${before:-an unknown commit} after ${timeout}s. The build log is in Vercel: team TIMAPP, project transport, Deployments." >&2
      exit 1
    fi
    sleep 15
  done
fi

{
  echo '## Production'
  echo
  echo "${url} serves \`${sha:0:7}\`."
} >> "$summary"
echo "${url} serves ${sha:0:7}."
