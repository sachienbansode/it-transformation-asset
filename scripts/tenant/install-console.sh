#!/usr/bin/env bash
# ITH-120 — install the NIYTRI platform console: its own IT Hub instance (code "niytri", own database) with the console
# switched on, plus the root worker (systemd timer, every minute) that carries out its jobs.
#
#   cd /opt/it-hub && sudo bash scripts/tenant/install-console.sh <console-domain> <admin-email> [github owner/repo]
#   e.g. sudo bash scripts/tenant/install-console.sh ithub-console.niytri.com admin@niytri.com sachienbansode/it-transformation-asset
#
# A GitHub token (only needed for a private repository) is asked for without echo and kept in the console's config only.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run with sudo"; exit 1; }
DOMAIN="${1:-}"; ADMIN="${2:-}"; REPO="${3:-}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ && "$ADMIN" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]] || { echo "Usage: install-console.sh <domain> <admin-email> [owner/repo]"; exit 1; }
BASE="$(cd "$(dirname "$0")/../.." && pwd)"; ENVF=/etc/it-hub-niytri.env

bash "$BASE/scripts/tenant/new-tenant.sh" niytri "$DOMAIN" ithub_niytri "$ADMIN"

echo; echo "== Console settings"
grep -q '^PLATFORM_CONSOLE=' "$ENVF" || echo "PLATFORM_CONSOLE=1" >> "$ENVF"
grep -q '^MAIN_DIR=' "$ENVF" || echo "MAIN_DIR=$BASE" >> "$ENVF"
if [[ -n "$REPO" ]] && ! grep -q '^GITHUB_REPO=' "$ENVF"; then
  echo "GITHUB_REPO=$REPO" >> "$ENVF"
  read -r -s -p "GitHub token for $REPO (Enter = none / public repo): " TOKEN; echo
  [[ -n "$TOKEN" ]] && echo "GITHUB_TOKEN=$TOKEN" >> "$ENVF"; unset TOKEN
fi
chmod 600 "$ENVF"
set -a; . "$ENVF"; set +a
psql "${DATABASE_URL/sslmode=no-verify/sslmode=require}" -X -q -c "UPDATE settings SET value = 'false' WHERE key = 'updates.consent_required'"   # the console is NIYTRI's own
systemctl restart it-hub-niytri

echo "== Worker (every minute)"
cat > /etc/systemd/system/it-hub-platform-worker.service <<UNIT
[Unit]
Description=IT Hub platform worker (NIYTRI console jobs)
[Service]
Type=oneshot
Environment=CONSOLE_ENV=$ENVF
Environment=MAIN_DIR=$BASE
ExecStart=/bin/bash $BASE/scripts/tenant/platform-worker.sh
UNIT
cat > /etc/systemd/system/it-hub-platform-worker.timer <<UNIT
[Unit]
Description=Run the IT Hub platform worker every minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload; systemctl enable --now it-hub-platform-worker.timer
echo
echo "Console ready: https://$DOMAIN  →  sign in, open 'NIYTRI Platform', register the existing instances"
echo "(e.g. main: folder $BASE, database = the one in /etc/it-hub.env)."
