#!/usr/bin/env bash
# ITH-120 — NIYTRI platform worker. Runs as root every minute (systemd timer, installed by install-console.sh) and carries
# out the jobs queued in the console's database: create a new client (new-tenant.sh) or deploy a release (deploy.sh).
# Only these two actions exist; every parameter is re-validated here. The web app itself never runs anything as root.
set -uo pipefail
CONSOLE_ENV="${CONSOLE_ENV:-/etc/it-hub-niytri.env}"
[[ -f "$CONSOLE_ENV" ]] || { echo "No console config $CONSOLE_ENV"; exit 0; }
set -a; . "$CONSOLE_ENV"; set +a
DB_URL="${DATABASE_URL/sslmode=no-verify/sslmode=require}"
q() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
MAIN="${MAIN_DIR:-/opt/it-hub}"
exec 9>/run/it-hub-platform-worker.lock; flock -n 9 || exit 0     # one worker at a time

while :; do
  JOB=$(q -Atc "UPDATE platform_jobs SET status = 'Running', started_at = now() WHERE id = (SELECT id FROM platform_jobs WHERE status = 'Queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id || '|' || kind || '|' || coalesce(client_id, 0) || '|' || coalesce(params->>'code', '') || '|' || coalesce(params->>'domain', '') || '|' || coalesce(params->>'dbName', '') || '|' || coalesce(params->>'adminEmail', '') || '|' || coalesce(params->>'ref', '') || '|' || coalesce(params->>'emergency', '')")
  [[ -z "$JOB" ]] && break
  IFS='|' read -r ID KIND CID CODE DOMAIN DBN ADMIN REF EMERG <<< "$JOB"
  LOG="/var/log/it-hub-platform/job-$ID.log"; mkdir -p /var/log/it-hub-platform; chmod 700 /var/log/it-hub-platform
  RC=0
  if ! [[ "$CODE" =~ ^[a-z][a-z0-9-]{1,30}$ ]]; then echo "bad client code" > "$LOG"; RC=2
  elif [[ "$KIND" == "new_client" ]]; then
    if [[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ && "$DBN" =~ ^[a-z][a-z0-9_]{1,40}$ && "$ADMIN" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]]; then
      # the one-time Super Admin password goes to a root-only file, never into the database or the job log
      ADMIN_PW_FILE="/root/it-hub-$CODE-first-admin.txt" bash "$MAIN/scripts/tenant/new-tenant.sh" "$CODE" "$DOMAIN" "$DBN" "$ADMIN" > "$LOG" 2>&1 || RC=$?
      if [[ $RC -eq 0 ]]; then q -c "UPDATE platform_clients SET status = 'Active', folder = '$(dirname "$MAIN")/it-hub-$CODE' WHERE id = $CID" >/dev/null
      else q -c "UPDATE platform_clients SET status = 'Failed' WHERE id = $CID" >/dev/null; fi
    else echo "bad parameters" > "$LOG"; RC=2; fi
  elif [[ "$KIND" == "deploy" ]]; then
    DIR=$(q -Atc "SELECT coalesce(folder, '') FROM platform_clients WHERE id = $CID")
    [[ -z "$DIR" ]] && DIR="$(dirname "$MAIN")/it-hub-$CODE"
    if [[ "$REF" =~ ^v[0-9]+\.[0-9]+\.[0-9]+[A-Za-z0-9.-]*$ && -f "$DIR/deploy.sh" ]]; then
      ( cd "$DIR" && REF="$REF" EMERGENCY="$EMERG" bash deploy.sh ) > "$LOG" 2>&1 || RC=$?
    else echo "bad release tag or folder $DIR" > "$LOG"; RC=2; fi
  fi
  ST=$([[ $RC -eq 0 ]] && echo Done || echo Failed)
  tail -c 20000 "$LOG" > "$LOG.tail"
  q -v log="$(cat "$LOG.tail")" >/dev/null <<< "UPDATE platform_jobs SET status = '$ST', finished_at = now(), log = :'log' WHERE id = $ID"
  rm -f "$LOG.tail"
done
