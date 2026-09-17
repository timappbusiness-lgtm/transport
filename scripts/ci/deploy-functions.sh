#!/usr/bin/env bash
# Deploys the edge functions whose sources changed in this push.
#
# Environment:
#   BEFORE                 github.event.before — the commit main was on
#   SUPABASE_PROJECT_REF   the project to deploy to
#   SUPABASE_ACCESS_TOKEN  read by the CLI itself
#
# `--use-api` bundles server-side, so no Docker is needed on the runner.
#
# Shared code counts: a change under supabase/functions/_shared affects
# every function, so that redeploys all of them rather than leaving two
# functions running against a helper that no longer exists.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

functions_dir="supabase/functions"
all=()
while IFS= read -r dir; do
  name="$(basename "$dir")"
  # _shared and the like are libraries, not deployable functions.
  [[ "$name" == _* ]] && continue
  [[ -f "$dir/index.ts" ]] || continue
  all+=("$name")
done < <(find "$functions_dir" -mindepth 1 -maxdepth 1 -type d | sort)

if [[ ${#all[@]} -eq 0 ]]; then
  echo "No deployable functions found under ${functions_dir}."
  exit 0
fi

before="${BEFORE:-}"
changed=()

# An empty, all-zero or unknown BEFORE means we cannot diff — the first push
# to a branch, a force push, or a manual run. Deploy everything: redeploying
# an unchanged function is harmless, skipping a changed one is not.
if [[ -z "$before" || "$before" =~ ^0+$ ]] || ! git cat-file -e "${before}^{commit}" 2>/dev/null; then
  echo "No usable previous commit (BEFORE='${before}'); deploying every function."
  changed=("${all[@]}")
else
  mapfile -t touched < <(git diff --name-only "$before" "${GITHUB_SHA:-HEAD}" -- "$functions_dir" || true)

  if [[ ${#touched[@]} -eq 0 ]]; then
    echo "No edge function sources changed in this push."
    {
      echo '## Edge functions'
      echo
      echo 'No function sources changed; nothing deployed.'
    } >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
    exit 0
  fi

  shared_changed=0
  for path in "${touched[@]}"; do
    rel="${path#"$functions_dir"/}"
    name="${rel%%/*}"
    [[ "$name" == _* ]] && shared_changed=1
  done

  if [[ "$shared_changed" -eq 1 ]]; then
    echo "Shared code changed; deploying every function."
    changed=("${all[@]}")
  else
    for path in "${touched[@]}"; do
      rel="${path#"$functions_dir"/}"
      name="${rel%%/*}"
      for known in "${all[@]}"; do
        if [[ "$known" == "$name" ]] && [[ ! " ${changed[*]-} " == *" $name "* ]]; then
          changed+=("$name")
        fi
      done
    done
  fi
fi

if [[ ${#changed[@]} -eq 0 ]]; then
  echo "Nothing to deploy."
  exit 0
fi

echo "Deploying: ${changed[*]}"
for name in "${changed[@]}"; do
  supabase functions deploy "$name" \
    --project-ref "${SUPABASE_PROJECT_REF}" \
    --use-api
done

{
  echo '## Edge functions'
  echo
  for name in "${changed[@]}"; do
    echo "- deployed \`$name\`"
  done
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
