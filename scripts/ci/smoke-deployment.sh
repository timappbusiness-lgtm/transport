#!/usr/bin/env bash
# Asks a fresh deployment whether it is actually serving.
#
#   bash scripts/ci/smoke-deployment.sh https://coridor-abc123.vercel.app
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

for path in "${paths[@]}"; do
  code="000"
  # A deployment can take a moment to become reachable behind the CDN.
  # curl already prints 000 through -w when it cannot connect, so the
  # fallback here is `|| true` rather than a second echo — otherwise a
  # failure reports the memorable but meaningless code 000000.
  for attempt in 1 2 3 4 5; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${url}${path}" || true)
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

echo "${url} is serving."
