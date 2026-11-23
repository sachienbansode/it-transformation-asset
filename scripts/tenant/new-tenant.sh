#!/usr/bin/env bash
# ITH-118 — create a NEW CLIENT instance of IT Hub on this server: its own database (same RDS), own folder, config,
# service, port, web address and HTTPS certificate. The app starts BLANK: system configuration only + one Super Admin.
#
#   cd /opt/it-hub && sudo bash scripts/tenant/new-tenant.sh <code> <domain> <database> <admin-email>
#   e.g. sudo bash scripts/tenant/new-tenant.sh ashikamf ithub-ashikamf.niytri.com ithub_ashikamf admin@niytri.com
#
# Needs: DNS for <domain> pointing to this server; /etc/it-hub.env of the main instance (RDS host, user, PGPASSWORD).
# The database password is read from that file into the environment only — never typed, never on a command line.
# Safe to re-run: every step checks first and skips what already exists. The admin password is created only once.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run with sudo"; exit 1; }
CODE="${1:-}"; DOMAIN="${2:-}"; DBNAME="${3:-}"; ADMIN="${4:-}"
[[ "$CODE" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || { echo "Client code: lower-case letters/digits/hyphen, e.g. ashikamf"; exit 1; }
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo "Domain looks wrong: $DOMAIN"; exit 1; }
[[ "$DBNAME" =~ ^[a-z][a-z0-9_]{1,40}$ ]] || { echo "Database name: lower-case letters/digits/underscore, e.g. ithub_ashikamf"; exit 1; }
[[ "$ADMIN" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$ ]] || { echo "Admin email looks wrong: $ADMIN"; exit 1; }

BASE="$(cd "$(dirname "$0")/../.." && pwd)"          # the main instance, e.g. /opt/it-hub
DIR="$(dirname "$BASE")/it-hub-$CODE"                  # e.g. /opt/it-hub-ashikamf
ENV_MAIN=/etc/it-hub.env; ENV_NEW="/etc/it-hub-$CODE.env"; SVC="it-hub-$CODE"
[[ -f "$ENV_MAIN" ]] || { echo "Missing $ENV_MAIN"; exit 1; }
say() { echo; echo "== $*"; }

# ── 1. code: own copy of the repository (same remote, can sit on its own release) ──
say "1/7 Code folder $DIR"
if [[ ! -d "$DIR/.git" ]]; then
  git clone -q "$BASE" "$DIR"
  git -C "$DIR" remote set-url origin "$(git -C "$BASE" remote get-url origin)"
  git -C "$DIR" fetch -q origin
  git -C "$DIR" checkout -q -B main origin/main
fi
echo "$CODE" > "$DIR/.tenant"

# ── 2. config: copy the main config, replace everything client-specific ──
say "2/7 Config $ENV_NEW"
if [[ ! -f "$ENV_NEW" ]]; then
  set -a; . "$ENV_MAIN"; set +a
  BASE_URL="${DATABASE_URL:?DATABASE_URL missing in $ENV_MAIN}"
  NEW_URL="$(echo "$BASE_URL" | sed -E "s#^(postgres(ql)?://[^/]+/)[^?]+#\1$DBNAME#")"
  PORT=3101; while (ss -ltn 2>/dev/null || true) | awk '{print $4}' | grep -qE "[:.]$PORT\$" || grep -qs "^PORT=$PORT\$" /etc/it-hub*.env; do PORT=$((PORT+1)); done
  umask 077
  { grep -vE '^(PORT|DATABASE_URL|SESSION_SECRET|CHAT_SECRET|CHAT_SECRET_OLD|APP_URL|TENANT|SEED_PROFILE|UPLOAD_DIR|PRIVATE_OBJECT_DIR|PUBLIC_OBJECT_SEARCH_PATHS|STORAGE_DRIVER|MAIL_[A-Z0-9_]*|CENTRAL_[A-Z0-9_]*|RECORDINGS_[A-Z0-9_]*|SEED_DEMO_[A-Z0-9_]*|VAPID_[A-Z0-9_]*|AUDITOR_OTP|APP_BUILD|CENTRAL_SSO_REDIRECT_URI)=' "$ENV_MAIN" || true
    echo "# ---- client instance: $CODE (created $(date -u +%F) by new-tenant.sh) ----"
    echo "TENANT=$CODE"
    echo "SEED_PROFILE=blank"
    echo "PORT=$PORT"
    echo "DATABASE_URL=$NEW_URL"
    echo "APP_URL=https://$DOMAIN"
    echo "SESSION_SECRET=$(openssl rand -hex 32)"
    echo "CHAT_SECRET=$(openssl rand -hex 32)"
    echo "UPLOAD_DIR=/var/lib/it-hub-$CODE/uploads"
  } > "$ENV_NEW"
  chmod 600 "$ENV_NEW"
fi
set -a; . "$ENV_NEW"; set +a
mkdir -p "$UPLOAD_DIR"
DB_URL="${DATABASE_URL/sslmode=no-verify/sslmode=require}"
ADMIN_URL="$(echo "$DB_URL" | sed -E 's#^(postgres(ql)?://[^/]+/)[^?]+#\1postgres#')"
echo "port $PORT · database $DBNAME"

# ── 3. database: create empty, build the tables, mark it as a blank client ──
say "3/7 Database $DBNAME"
if ! psql "$ADMIN_URL" -X -Atc "SELECT 1 FROM pg_database WHERE datname = '$DBNAME'" | grep -q 1; then
  psql "$ADMIN_URL" -X -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DBNAME\""
fi
if ! psql "$DB_URL" -X -Atc "SELECT to_regclass('public.users')" | grep -q users; then
  if [[ -f "$DIR/db/new_client_database.sql" ]]; then   # one file: all tables + default system configuration (ITH-121)
    psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$DIR/db/new_client_database.sql" >/dev/null
  else
    psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$DIR/db/01_schema.sql" >/dev/null
  fi
fi
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "INSERT INTO settings (key, value, description) VALUES
  ('tenant.profile', '\"blank\"', 'Client instance: nothing pre-loaded (set by new-tenant.sh)'),
  ('tenant.code', to_jsonb('$CODE'::text), 'Client code (set by new-tenant.sh)'),
  ('tenant.created_at', to_jsonb(now()), 'Client instance created')
  ON CONFLICT (key) DO NOTHING"

# ── 4. service: same unit as the main app, pointed at this folder and config ──
say "4/7 Service $SVC"
UNIT_MAIN="$(systemctl show -p FragmentPath it-hub --value)"; UNIT_NEW="/etc/systemd/system/$SVC.service"
[[ -f "$UNIT_MAIN" ]] || { echo "Cannot find the it-hub service file"; exit 1; }
if [[ ! -f "$UNIT_NEW" ]]; then
  sed -e "s#$BASE/#$DIR/#g" -e "s#$BASE\$#$DIR#" -e "s#$BASE #$DIR #g" -e "s#$ENV_MAIN#$ENV_NEW#g" -e "s#^Description=.*#Description=IT Hub ($CODE)#" "$UNIT_MAIN" > "$UNIT_NEW"
  grep -q "$ENV_NEW" "$UNIT_NEW" || sed -i "/^\[Service\]/a EnvironmentFile=$ENV_NEW" "$UNIT_NEW"
  systemctl daemon-reload; systemctl enable -q "$SVC"
fi
RUN_AS="$(systemctl show -p User "$SVC" --value)"          # same owner as the main instance's files
chown -R --reference="$BASE" "$DIR"; [[ -n "$RUN_AS" && "$RUN_AS" != root ]] && chown -R "$RUN_AS" "/var/lib/it-hub-$CODE" || true

# ── 5. deploy: migrations (system configuration only — no business data), build, start ──
say "5/7 Deploy (migrations + build)"
bash "$DIR/deploy.sh"

# ── 6. first Super Admin (only once) ──
say "6/7 Super Admin $ADMIN"
if psql "$DB_URL" -X -Atc "SELECT count(*) FROM users" | grep -qx 0; then
  PW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)Aa1!"
  HASH="$(cd "$DIR/artifacts/api-server" && PW="$PW" node -e 'console.log(require("bcryptjs").hashSync(process.env.PW, 12))')"
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v email="$ADMIN" -v hash="$HASH" <<'SQL'
INSERT INTO users (email, password_hash, name, user_type, role, department, designation, is_active, status, identity_source, must_change_password)
VALUES (lower(:'email'), :'hash', 'Super Admin', 'internal', 'admin', 'it', 'Initial Super Admin (disable after go-live)', true, 'active', 'local', true);
INSERT INTO audit_logs (entity_type, action, performed_by, summary)
VALUES ('User', 'CREATE', 'new-tenant.sh', 'Initial Super Admin ' || lower(:'email') || ' created for the new client instance');
SQL
  ADMIN_PW="$PW"
else
  echo "users already exist — Super Admin not created again"
fi

# ── 7. web address + HTTPS ──
say "7/7 Web address https://$DOMAIN"
SITE="/etc/nginx/sites-available/$SVC"
if [[ ! -f "$SITE" ]]; then
  BODY_MAX="$(grep -rhoE 'client_max_body_size[^;]+' /etc/nginx/sites-enabled 2>/dev/null | head -1 | awk '{print $2}' || true)"
  cat > "$SITE" <<NGX
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size ${BODY_MAX:-50m};
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
NGX
  ln -sf "$SITE" "/etc/nginx/sites-enabled/$SVC"
  nginx -t && systemctl reload nginx
  bash "$BASE/scripts/server/harden-nginx.sh" || echo "!! nginx hardening skipped — run scripts/server/harden-nginx.sh"   # ITH-131 VAPT
  if command -v certbot >/dev/null; then certbot --nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos --keep-until-expiring -q || echo "!! certbot failed — check DNS for $DOMAIN, then: sudo certbot --nginx -d $DOMAIN --redirect"
  else echo "!! certbot not installed — add HTTPS for $DOMAIN the same way as the main site"; fi
fi

echo
echo "================================================================"
echo " Client '$CODE' is ready:  https://$DOMAIN"
echo " Folder $DIR · service $SVC · port $PORT · database $DBNAME"
if [[ -n "${ADMIN_PW:-}" ]]; then
echo " Super Admin: $ADMIN"
if [[ -n "${ADMIN_PW_FILE:-}" ]]; then
  ( umask 077; printf 'IT Hub %s — first Super Admin %s\nOne-time password: %s\nDelete this file after signing in.\n' "$CODE" "$ADMIN" "$ADMIN_PW" > "$ADMIN_PW_FILE" )
  echo " One-time password saved to $ADMIN_PW_FILE (root only) — read it with: sudo cat $ADMIN_PW_FILE  then delete the file"
else
echo " One-time password (shown ONCE, not stored anywhere): $ADMIN_PW"
fi
echo " Sign in, create the client's own admin users, then disable this account."
fi
echo " Update later:  cd $DIR && sudo bash deploy.sh"
echo "================================================================"
