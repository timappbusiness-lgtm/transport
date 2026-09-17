#!/usr/bin/env bash
# Fails with a readable message when a required secret is not set.
#
#   bash scripts/ci/require-secrets.sh VERCEL_TOKEN VERCEL_ORG_ID
#
# Each argument is the NAME of an environment variable that the calling step
# has mapped from `secrets`. A missing one is a setup mistake, not a code
# failure, and the error says which name to add and where — otherwise the
# job fails somewhere deep inside a CLI with a message about authentication
# that sends people looking in the wrong place.
set -uo pipefail

missing=()
for name in "$@"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if [[ ${#missing[@]} -eq 0 ]]; then
  echo "All ${#@} secret(s) present."
  exit 0
fi

{
  echo "## Missing repository secrets"
  echo
  for name in "${missing[@]}"; do
    echo "- \`$name\`"
  done
  echo
  echo 'Add them under **Settings → Secrets and variables → Actions**, then re-run this workflow.'
  echo
  echo '| Secret | Where it comes from |'
  echo '|---|---|'
  echo '| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |'
  echo '| `SUPABASE_PROJECT_REF` | the project ref, e.g. `sspgyuavkjmzgbyqvunk` |'
  echo '| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database |'
  echo '| `VERCEL_TOKEN` | https://vercel.com/account/tokens |'
  echo '| `VERCEL_ORG_ID` | `orgId` in `.vercel/project.json` after `vercel link` |'
  echo '| `VERCEL_PROJECT_ID` | `projectId` in the same file |'
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"

echo "::error::Missing repository secret(s): ${missing[*]}. Add them under Settings -> Secrets and variables -> Actions." >&2
exit 1
