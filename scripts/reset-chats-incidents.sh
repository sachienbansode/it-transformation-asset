#!/usr/bin/env bash
# ITH-085 — one-time clean-up before go-live: deletes ALL chats (messages, files, screen-session recordings) and ALL incidents
# (with their history, approvals and attachment records). With --all-tickets it also deletes problems, change requests and
# service requests. Device health items are kept; their ticket links are cleared, so the next device report raises fresh
# incidents for the warnings that still apply.
#
# A backup of every table it changes is written first to /var/backups/it-hub/. Nothing runs without typing RESET.
# Usage (on the server):  cd /opt/it-hub && sudo bash scripts/reset-chats-incidents.sh [--all-tickets]
# The password comes from PGPASSWORD in /etc/it-hub.env — never put it on the command line.
set -euo pipefail
ALL=0; [[ "${1:-}" == "--all-tickets" ]] && ALL=1
set -a; . "${IT_HUB_ENV:-/etc/it-hub.env}"; set +a
DB_URL="${DATABASE_URL/sslmode=no-verify/sslmode=require}"
q() { psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }

echo "This deletes, permanently:"
echo "  chats:     $(q "SELECT count(*) FROM device_chats") (messages $(q "SELECT count(*) FROM device_chat_messages"), files/recordings $(q "SELECT count(*) FROM chat_attachments"), screen sessions $(q "SELECT count(*) FROM chat_sessions"))"
echo "  incidents: $(q "SELECT count(*) FROM itsm_incidents")"
if [[ $ALL == 1 ]]; then
  echo "  problems:  $(q "SELECT count(*) FROM itsm_problems")   changes: $(q "SELECT count(*) FROM itsm_changes")   service requests: $(q "SELECT count(*) FROM itsm_service_requests")"
fi
read -r -p "Type RESET to continue: " ok
[[ "$ok" == "RESET" ]] || { echo "Cancelled — nothing was changed."; exit 1; }

TS=$(date +%Y%m%d-%H%M%S); BK="${BACKUP_DIR:-/var/backups/it-hub}"; mkdir -p "$BK"; chmod 700 "$BK"
TABLES=(device_chats device_chat_messages chat_members chat_attachments chat_sessions chat_signals itsm_incidents itsm_ticket_history itsm_approvals itsm_attachments asset_agent_alerts notifications)
[[ $ALL == 1 ]] && TABLES+=(itsm_problems itsm_changes itsm_service_requests)
q "SELECT to_regclass('public.ticket_close_suggestions') IS NOT NULL" | grep -q t && TABLES+=(ticket_close_suggestions)
ARGS=(); for t in "${TABLES[@]}"; do ARGS+=(-t "public.$t"); done
echo "Backing up to $BK/reset-$TS.dump …"
pg_dump "$DB_URL" -Fc "${ARGS[@]}" -f "$BK/reset-$TS.dump"
chmod 600 "$BK/reset-$TS.dump"

TYPES="'incident'"; [[ $ALL == 1 ]] && TYPES="'incident','problem','change','service_request','service-request','sr'"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 <<SQL
BEGIN;
-- chats, files, recordings, screen sessions (TRUNCATE bypasses the per-row "no delete / read only" guards on purpose)
TRUNCATE chat_signals, chat_sessions, chat_attachments, chat_members, device_chat_messages, device_chats RESTART IDENTITY;
DELETE FROM notifications WHERE link LIKE '/chats%' OR link LIKE '/my-it-chats%' OR link LIKE '/itsm-chats%' OR link LIKE '/itsm-incidents%' $( [[ $ALL == 1 ]] && echo "OR link LIKE '/itsm-problems%' OR link LIKE '/itsm-changes%' OR link LIKE '/itsm-service-requests%'" );
-- incidents (and, with --all-tickets, problems / changes / service requests)
DELETE FROM itsm_ticket_history WHERE ticket_type IN ($TYPES);
DELETE FROM itsm_approvals WHERE ticket_type IN ($TYPES);
DELETE FROM itsm_attachments WHERE ticket_type IN ($TYPES);
DO \$\$ BEGIN IF to_regclass('public.ticket_close_suggestions') IS NOT NULL THEN TRUNCATE ticket_close_suggestions RESTART IDENTITY; END IF; END \$\$;
UPDATE asset_agent_alerts SET incident_id = NULL, ticket_no = NULL, ticket_auto = false, ticket_tried_at = NULL WHERE incident_id IS NOT NULL OR ticket_tried_at IS NOT NULL;
UPDATE itsm_incidents SET problem_id = NULL WHERE problem_id IS NOT NULL;
TRUNCATE itsm_incidents RESTART IDENTITY CASCADE;
$( [[ $ALL == 1 ]] && echo "TRUNCATE itsm_problems, itsm_changes, itsm_service_requests RESTART IDENTITY CASCADE;" )
INSERT INTO audit_logs (entity_type, action, performed_by, summary)
VALUES ('system', 'reset', 'Server script (${SUDO_USER:-${USER:-root}})', 'Go-live clean-up: all chats, recordings and incidents$( [[ $ALL == 1 ]] && echo ", problems, changes and service requests" ) deleted. Backup: $BK/reset-$TS.dump');
COMMIT;
SQL
echo "Done. Backup: $BK/reset-$TS.dump"
echo "Device health items were kept; the next report from each device raises fresh incidents for warnings that still apply."
echo "Keep the backup file until you are sure; it holds everything that was deleted."
