#!/usr/bin/env bash
# Writes the Supabase security advisors into the run summary.
#
# This reports, it does not gate. Some findings are accepted on purpose and
# recorded in docs/DEPLOYMENT.md; the point of the report is that a finding
# which is NOT on that list becomes visible on the release that introduced
# it, rather than at the next audit.
set -uo pipefail

# Findings the team has looked at and accepted. Each is explained in
# docs/DEPLOYMENT.md under "Advisor findings that are accepted". Keep the two
# lists in step: adding a name here without the reasoning there turns an
# accepted risk into a forgotten one.
ACCEPTED=(
  security_definer_view
  extension_in_public
  function_search_path_mutable
  rls_enabled_no_policy
)

export ACCEPTED_NAMES="${ACCEPTED[*]}"

# A temp dir, not the repository root: this runs inside a checkout, and
# scratch files there show up as untracked changes in every later step.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

raw="$(supabase db advisors --linked --type security --output-format json 2>"$work/advisors.err" || true)"

if [[ -z "$raw" ]]; then
  {
    echo '## Security advisors'
    echo
    echo 'The advisors command returned nothing. Stderr:'
    echo
    echo '```'
    cat "$work/advisors.err" 2>/dev/null || echo '(empty)'
    echo '```'
  } >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
  # Not a release blocker: production is already live at this point and a
  # missing report is a reporting problem, not a broken deployment.
  echo "::warning::Could not read the security advisors; see the run summary."
  exit 0
fi

printf '%s' "$raw" > "$work/advisors.json"

ADVISORS_JSON="$work/advisors.json" python3 - <<'PY' >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
import json
import os

accepted = set(os.environ.get('ACCEPTED_NAMES', '').split())

try:
    with open(os.environ['ADVISORS_JSON'], encoding='utf-8') as handle:
        data = json.load(handle)
except (OSError, json.JSONDecodeError) as error:
    print('## Security advisors\n')
    print(f'Could not parse the advisors output: {error}')
    raise SystemExit(0)

# The CLI has moved this shape around between versions; accept either a bare
# list or an object with a "lints" key.
lints = data.get('lints', data) if isinstance(data, dict) else data
if not isinstance(lints, list):
    lints = []

new, known = [], []
for lint in lints:
    name = str(lint.get('name', ''))
    (known if name in accepted else new).append(lint)

print('## Security advisors\n')

if not lints:
    print('No findings.')
    raise SystemExit(0)

def table(rows):
    print('| Level | Finding | What it is about |')
    print('|---|---|---|')
    for row in rows:
        level = str(row.get('level', '')).upper()
        name = str(row.get('name', ''))
        title = str(row.get('title', '') or row.get('description', ''))
        title = title.replace('|', '\\|').replace('\n', ' ')
        if len(title) > 160:
            title = title[:157] + '…'
        print(f'| {level} | `{name}` | {title} |')
    print()

if new:
    print(f'### {len(new)} finding(s) not on the accepted list\n')
    table(new)
    print('Each of these is either a real problem or a decision to record in '
          '`docs/DEPLOYMENT.md` and add to the accepted list in '
          '`scripts/ci/advisors-report.sh`.\n')
else:
    print('Nothing new. Every finding below is on the accepted list.\n')

if known:
    print(f'<details><summary>{len(known)} accepted finding(s)</summary>\n')
    table(known)
    print('</details>')
PY
