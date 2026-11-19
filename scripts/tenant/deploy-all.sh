#!/usr/bin/env bash
# ITH-121 — deploy one release to EVERY client instance on this server (folders /opt/it-hub-<client> with a .tenant file).
# Each client's own consent rule applies: a client that has not approved the version is skipped (not an error).
#
#   cd /opt/it-hub && sudo REF=v1.88.0 bash scripts/tenant/deploy-all.sh            # all clients
#   cd /opt/it-hub && sudo REF=v1.88.0 INCLUDE_MAIN=1 bash scripts/tenant/deploy-all.sh   # also the original instance
set -uo pipefail
[[ $EUID -eq 0 ]] || { echo "Run with sudo"; exit 1; }
[[ "${REF:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]] || { echo "Set REF to a release tag, e.g. REF=v1.88.0"; exit 1; }
BASE="$(cd "$(dirname "$0")/../.." && pwd)"; PARENT="$(dirname "$BASE")"
DIRS=(); [[ "${INCLUDE_MAIN:-0}" == "1" ]] && DIRS+=("$BASE")
for d in "$PARENT"/it-hub-*; do [[ -f "$d/.tenant" && -f "$d/deploy.sh" ]] && DIRS+=("$d"); done
[[ ${#DIRS[@]} -eq 0 ]] && { echo "No client folders found next to $BASE"; exit 0; }
mkdir -p /var/log/it-hub-platform; SUMMARY=()
for d in "${DIRS[@]}"; do
  name="$(cat "$d/.tenant" 2>/dev/null || echo main)"; log="/var/log/it-hub-platform/deploy-$name-$(date +%Y%m%d-%H%M%S).log"
  echo "== $name ($d)"
  ( cd "$d" && REF="$REF" bash deploy.sh ) > "$log" 2>&1; rc=$?
  case $rc in 0) r="deployed";; 3) r="WAITING for client approval";; *) r="FAILED (exit $rc) — see $log";; esac
  echo "   $r"; SUMMARY+=("$(printf '%-14s %s' "$name" "$r")")
done
echo; echo "== $REF summary"; printf '%s\n' "${SUMMARY[@]}"
