#!/usr/bin/env bash
# Asks a fresh deployment whether it is actually serving.
#
#   bash scripts/ci/smoke-deployment.sh https://transport-abc123.vercel.app
#
# A build that succeeds and a site that answers are different things: a
# missing environment variable throws at request time, long after the build
# was green. These are the two pages that prove the app booted — the
# homepage, and one page that reads the session.
set -euo pipefail

url="${1:?usage: smoke-deployment.sh <deployment-url>}"
url="${url%/}"

paths=(/ /autentificare)
failed=0

# Previews sit behind Vercel Authentication. With the project's automation
# bypass secret in the environment the checks go through it; production
# answers without it.
auth=()
if [[ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]]; then
  auth=(-H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}")
fi

for path in "${paths[@]}"; do
  code="000"
  # A deployment can take a moment to become reachable behind the CDN.
  # curl already prints 000 through -w when it cannot connect, so the
  # fallback here is `|| true` rather than a second echo — otherwise a
  # failure reports the memorable but meaningless code 000000.
  for attempt in 1 2 3 4 5; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 ${auth[@]+"${auth[@]}"} "${url}${path}" || true)
    [[ -n "$code" ]] || code="000"
    [[ "$code" == "200" ]] && break
    sleep $(( attempt * 3 ))
  done

  if [[ "$code" == "200" ]]; then
    echo "  ok  ${path} -> ${code}"
  else
    echo "FAIL  ${path} -> ${code}"
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  echo "::error::${url} did not answer 200 on every checked path." >&2
  exit 1
fi

# The security headers, on the real response.
#
# They are set in next.config.ts and covered by a unit test and a Playwright
# spec, but both of those look at our side of the wire. This looks at what
# the deployment actually returns — a header lost to a platform setting, a
# CDN rule or a bad merge would pass every test we run locally and still be
# missing from production. Before the audit there were none at all.
headers="$(curl -sS -D - -o /dev/null --max-time 30 ${auth[@]+"${auth[@]}"} "${url}/" || true)"
missing=()

while IFS='|' read -r header expected; do
  line="$(printf '%s' "$headers" | grep -i "^${header}:" || true)"
  if [[ -z "$line" ]]; then
    missing+=("${header} (absent)")
  elif [[ "$line" != *"$expected"* ]]; then
    missing+=("${header} (does not contain '${expected}')")
  fi
done <<'CHECKS'
content-security-policy|frame-ancestors 'none'
strict-transport-security|max-age=
x-content-type-options|nosniff
x-frame-options|DENY
referrer-policy|strict-origin-when-cross-origin
permissions-policy|camera=()
CHECKS

if [[ ${#missing[@]} -ne 0 ]]; then
  printf '::error::%s is missing security headers: %s\n' "$url" "${missing[*]}" >&2
  exit 1
fi

echo "  ok  security headers on /"
echo "${url} is serving."
