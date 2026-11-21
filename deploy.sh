#!/usr/bin/env bash
# IT Hub deploy: get the code, apply DB migrations, build, restart — for ONE client instance (the folder this script is in).
#
#   Ashika (main instance):   cd /opt/it-hub && sudo bash deploy.sh
#   Another client:           cd /opt/it-hub-<client> && sudo bash deploy.sh
#   A specific release:       sudo REF=v1.86.0 bash deploy.sh        (git tag / branch / commit; default = latest main)
#   Without client approval:  sudo REF=v1.88.0 EMERGENCY="reason (shown to the client)" bash deploy.sh
#
# Client consent (ITH-120): when the client's database has updates.consent_required = true (all client instances), a NEW
# version is deployed only if the client approved it in Admin › Updates, or with an EMERGENCY reason. Otherwise the code
# is put back to the previous commit and nothing changes.
#
# Each client folder holds a .tenant file (written by scripts/tenant/new-tenant.sh) naming its config:
#   /etc/it-hub-<client>.env and service it-hub-<client>. No .tenant file = the original instance (/etc/it-hub.env, it-hub).
# DB migrations = db/NN_*.sql with NN >= 05, run in order. They must be re-runnable (IF NOT EXISTS / WHERE NOT EXISTS).
# Each run is recorded in the client's database (schema_migrations: file + checksum; app_deployments: version, commit, result).
# Destructive scripts (names containing "clear" or "reset") are never run here — run them by hand only when asked.
set -Eeuo pipefail
cd "$(dirname "$0")"

TENANT="$(cat .tenant 2>/dev/null | tr -cd 'a-z0-9-' || true)"
if [[ -n "$TENANT" ]]; then ENV_FILE="/etc/it-hub-$TENANT.env"; SERVICE="it-hub-$TENANT"; else ENV_FILE="/etc/it-hub.env"; SERVICE="it-hub"; fi
echo "== Client: ${TENANT:-main}  (config $ENV_FILE, service $SERVICE)"

command -v psql >/dev/null || { echo "Installing psql client"; apt-get install -y postgresql-client >/dev/null; }

git checkout -- pnpm-workspace.yaml 2>/dev/null || true
PREV="$(git rev-parse HEAD)"
if [[ -n "${REF:-}" ]]; then
  git fetch origin --tags --prune
  git checkout -f "$REF"
else
  git checkout -q main 2>/dev/null || true
  git pull origin main
fi
# the pull may have changed this script itself: run the NEW copy once (bash reads scripts while running)
if [[ -z "${DEPLOY_REEXEC:-}" ]] && ! git diff --quiet "$PREV" HEAD -- deploy.sh 2>/dev/null; then
  echo "== deploy.sh was updated — restarting with the new version"; export DEPLOY_REEXEC=1; exec bash "$0" "$@"
fi
VERSION="$(cat VERSION 2>/dev/null || echo unknown)"; COMMIT="$(git rev-parse --short HEAD)"; GITREF="${REF:-main}"
echo "== Version $VERSION ($COMMIT, $GITREF)"

set -a; . "$ENV_FILE"; set +a          # DATABASE_URL + PGPASSWORD (password stays in env only)
DB_URL="${DATABASE_URL/sslmode=no-verify/sslmode=require}"
q() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

DEP_ID=""
# ── client consent gate ──
CONSENT=$(q -Atc "SELECT value::text FROM settings WHERE key = 'updates.consent_required'" 2>/dev/null || true)
if [[ "$CONSENT" == "true" ]]; then
  LAST=$(q -Atc "SELECT version FROM app_deployments WHERE status = 'Done' ORDER BY started_at DESC LIMIT 1" 2>/dev/null || true)
  if [[ -n "$LAST" && "$LAST" != "$VERSION" ]]; then   # first install needs no approval
    REQ=$(q -Atc "SELECT id || '|' || status || '|' || (emergency_reason IS NOT NULL)::text FROM app_update_requests WHERE version = '$VERSION' ORDER BY id DESC LIMIT 1" 2>/dev/null || true)
    RID="${REQ%%|*}"; RST="$(echo "$REQ" | cut -d'|' -f2)"; REM="${REQ##*|}"
    if [[ -n "${EMERGENCY:-}" ]]; then
      EMV="$(printf %s "$EMERGENCY" | tr -d "'" | cut -c1-500)"
      if [[ -n "$RID" ]]; then q -c "UPDATE app_update_requests SET emergency_reason = '$EMV' WHERE id = $RID" >/dev/null
      else q -c "INSERT INTO app_update_requests (version, git_ref, title, status, requested_by, emergency_reason) VALUES ('$VERSION', '$GITREF', 'Emergency update', 'Pending', 'NIYTRI (${SUDO_USER:-$(whoami)})', '$EMV')" >/dev/null; fi
      echo "== EMERGENCY deploy of $VERSION without approval: $EMV (recorded in the client's Admin › Updates)"
    elif [[ "$RST" == "Approved" || "$REM" == "true" ]]; then
      echo "== Client consent: version $VERSION ${RST:-} ${REM/true/(emergency)}"
    else
      git checkout -q -f "$PREV"
      echo "!! Not deployed: the client has not approved version $VERSION (status: ${RST:-not requested})."
      echo "   Send it for approval from the NIYTRI console (or Admin › Updates request), or run with EMERGENCY=\"reason\"."
      exit 3
    fi
  fi
fi
fail() { [[ -n "$DEP_ID" ]] && q -c "UPDATE app_deployments SET status='Failed', finished_at=now() WHERE id=$DEP_ID" >/dev/null 2>&1 || true; echo "!! Deploy FAILED"; }
trap fail ERR

newdep() { q -Atc "INSERT INTO app_deployments (tenant, version, git_commit, git_ref, status, deployed_by)
  VALUES ('${TENANT:-main}', '$VERSION', '$COMMIT', '$GITREF', 'Running', '${SUDO_USER:-$(whoami)}') RETURNING id" | head -1; }
q -Atc "SELECT to_regclass('public.app_deployments')" | grep -q app_deployments && DEP_ID=$(newdep)

# First install on an EMPTY database (e.g. a client on its own server, ITH-143): load the base schema + default
# system configuration once, so the migrations below have their tables. Never runs on a database that has tables.
if ! q -Atc "SELECT to_regclass('public.users')" | grep -q users; then
  echo "== Empty database: loading base schema (db/new_client_database.sql)"
  q -f db/new_client_database.sql >/dev/null
  q -c "INSERT INTO settings (key, value, description) VALUES ('tenant.profile', '\"blank\"', 'Client instance: nothing pre-loaded'), ('tenant.code', to_jsonb('${TENANT:-main}'::text), 'Client code') ON CONFLICT (key) DO NOTHING" >/dev/null
  DEP_ID=$(newdep)
fi
echo "== DB migrations"
RAN=()
for f in $(ls db/[0-9][0-9]_*.sql | sort); do
  n=$(basename "$f"); num=${n%%_*}
  [[ 10#$num -lt 5 ]] && continue
  [[ "$n" =~ clear|reset ]] && continue
  echo "-> $n"
  q -c "SET client_min_messages=warning; SET search_path TO public" -f "$f"
  RAN+=("$f")
done
# record what ran (new or changed files count as "changed" for this version)
CHANGED=0
for f in "${RAN[@]}"; do
  n=$(basename "$f"); sum=$(sha256sum "$f" | cut -c1-64)
  c=$(q -Atc "WITH old AS (SELECT checksum FROM schema_migrations WHERE filename = '$n'),
    up AS (INSERT INTO schema_migrations (filename, checksum, app_version) VALUES ('$n', '$sum', '$VERSION')
      ON CONFLICT (filename) DO UPDATE SET runs = schema_migrations.runs + 1, last_applied_at = now(),
        app_version = CASE WHEN schema_migrations.checksum = EXCLUDED.checksum THEN schema_migrations.app_version ELSE EXCLUDED.app_version END,
        checksum = EXCLUDED.checksum RETURNING 1)
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM old) OR (SELECT checksum FROM old) <> '$sum' THEN 1 ELSE 0 END FROM up")
  CHANGED=$((CHANGED + ${c:-0}))
done
[[ -z "$DEP_ID" ]] && DEP_ID=$(newdep)      # first deploy: the table was just created
q -c "UPDATE app_deployments SET migrations_changed = $CHANGED WHERE id = $DEP_ID" >/dev/null

# Demo data is opt-in (never on production): sudo LOAD_DEMO=1 bash deploy.sh  ·  remove: sudo REMOVE_DEMO=1 bash deploy.sh
if [[ "${LOAD_DEMO:-0}" == "1" ]]; then
  echo "== Demo data: load (skipped if already loaded)"
  q -c "SET client_min_messages=notice; SET search_path TO public" -f db/manual_demo_data.sql
fi
if [[ "${REMOVE_DEMO:-0}" == "1" ]]; then
  echo "== Demo data: remove"
  q -c "SET client_min_messages=notice; SET search_path TO public" -f db/manual_demo_data_remove.sql
fi

echo "== Build"
CI=true pnpm install --frozen-lockfile
pnpm --filter ./artifacts/it-transformation run build
pnpm --filter ./artifacts/api-server run build

systemctl restart "$SERVICE"
sleep 2
systemctl status "$SERVICE" --no-pager | head -5
q -c "UPDATE app_deployments SET status='Done', finished_at=now() WHERE id=$DEP_ID" >/dev/null
q -c "UPDATE app_update_requests SET status = 'Deployed', deployed_at = now() WHERE version = '$VERSION' AND status IN ('Approved', 'Pending', 'Deferred')" >/dev/null 2>&1 || true
echo "== Done: ${TENANT:-main} is on $VERSION ($COMMIT)"
