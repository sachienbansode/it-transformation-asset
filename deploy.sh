#!/usr/bin/env bash
# IT Hub deploy: pull, apply DB migrations, build, restart.
# Usage (on server):  cd /opt/it-hub && sudo bash deploy.sh
# DB migrations = db/NN_*.sql with NN >= 05, run in order. They must be re-runnable (IF NOT EXISTS / WHERE NOT EXISTS).
# Destructive scripts (names containing "clear" or "reset") are never run here — run them by hand only when asked.
set -euo pipefail
cd "$(dirname "$0")"

command -v psql >/dev/null || { echo "Installing psql client"; apt-get install -y postgresql-client >/dev/null; }

git checkout -- pnpm-workspace.yaml 2>/dev/null || true
git pull origin main

set -a; . /etc/it-hub.env; set +a          # DATABASE_URL + PGPASSWORD (password stays in env only)
DB_URL="${DATABASE_URL/sslmode=no-verify/sslmode=require}"

echo "== DB migrations"
for f in $(ls db/[0-9][0-9]_*.sql | sort); do
  n=$(basename "$f"); num=${n%%_*}
  [[ 10#$num -lt 5 ]] && continue
  [[ "$n" =~ clear|reset ]] && continue
  echo "-> $n"
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "SET client_min_messages=warning; SET search_path TO public" -f "$f"
done

echo "== Build"
CI=true pnpm install --frozen-lockfile
pnpm --filter ./artifacts/it-transformation run build
pnpm --filter ./artifacts/api-server run build

systemctl restart it-hub
sleep 2
systemctl status it-hub --no-pager | head -5
