#!/usr/bin/env bash
# Waits for Vercel's preview build of a commit and prints its URL.
#
#   url=$(bash scripts/ci/wait-for-preview.sh <commit-sha>)
#
# Vercel's Git integration builds every branch except `main` (vercel.json)
# and reports each build to GitHub as a deployment. This reads that report
# through the GitHub API, so the workflow needs no Vercel credential — only
# GH_TOKEN with `deployments: read`.
#
# Only the URL goes to stdout; progress goes to stderr.
set -euo pipefail

sha="${1:?usage: wait-for-preview.sh <commit-sha>}"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
timeout="${PREVIEW_TIMEOUT_SECONDS:-1200}"
deadline=$(( SECONDS + timeout ))

while :; do
  id=$(gh api "repos/${repo}/deployments?sha=${sha}&per_page=100" \
    --jq '[.[] | select(.creator.login == "vercel[bot]" and (.environment | startswith("Preview")))][0].id // empty' \
    || true)

  if [[ -n "$id" ]]; then
    status=$(gh api "repos/${repo}/deployments/${id}/statuses?per_page=1" \
      --jq '.[0] | "\(.state // "pending") \(.environment_url // "")"' || true)
    state="${status%% *}"
    target="${status#* }"
    case "$state" in
      success)
        if [[ -n "$target" ]]; then
          echo "$target"
          exit 0
        fi
        ;;
      failure | error)
        echo "::error::Vercel's preview build of ${sha:0:7} failed. The build log is in Vercel: team TIMAPP, project transport, Deployments." >&2
        exit 1
        ;;
    esac
    echo "Preview of ${sha:0:7}: ${state:-pending}" >&2
  else
    echo "Preview of ${sha:0:7}: not started yet" >&2
  fi

  if (( SECONDS >= deadline )); then
    echo "::error::No finished Vercel preview for ${sha:0:7} after ${timeout}s." >&2
    exit 1
  fi
  sleep 15
done
