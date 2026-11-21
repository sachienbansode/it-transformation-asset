#!/usr/bin/env bash
# ITH-131 (VAPT) — web-server hardening for every IT Hub site on this server. Safe to run again.
#   - nginx version hidden (server_tokens off) and, where the headers-more module is available, the "Server" header removed
#   - X-Powered-By from the app never passed on
#   - TRACE / TRACK refused at nginx as well (the app refuses unused methods itself)
# Checks the configuration before reloading and puts the old one back if the check fails.
#   cd /opt/it-hub && sudo bash scripts/server/harden-nginx.sh
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run with sudo"; exit 1; }
CONF=/etc/nginx/nginx.conf; SNIP=/etc/nginx/conf.d/ithub-hardening.conf
cp -a "$CONF" "$CONF.bak.$(date +%s)"

# 1. hide the version
if grep -qE '^\s*#?\s*server_tokens' "$CONF"; then sed -i -E 's/^\s*#?\s*server_tokens\s+\w+;/\tserver_tokens off;/' "$CONF"
else sed -i -E '0,/http\s*\{/s//http {\n\tserver_tokens off;/' "$CONF"; fi

# 2. remove the Server header completely (needs the headers-more module; installed if the package exists)
HM=0
if ! nginx -V 2>&1 | grep -q headers-more && [[ ! -e /etc/nginx/modules-enabled/50-mod-http-headers-more-filter.conf ]]; then
  apt-get install -y -q libnginx-mod-http-headers-more-filter >/dev/null 2>&1 || true
fi
[[ -e /etc/nginx/modules-enabled/50-mod-http-headers-more-filter.conf ]] || nginx -V 2>&1 | grep -q headers-more && HM=1

# 3. snippet included in the http block of every site
cat > "$SNIP" <<NGX
# IT Hub hardening (scripts/server/harden-nginx.sh)
proxy_hide_header X-Powered-By;
$( [[ $HM -eq 1 ]] && echo "more_clear_headers Server;" )
map \$request_method \$ithub_bad_method { default 0; TRACE 1; TRACK 1; }
NGX
# refuse TRACE / TRACK in every IT Hub site (found by the ports in /etc/it-hub*.env)
PORTS=$(grep -h '^PORT=' /etc/it-hub*.env 2>/dev/null | cut -d= -f2 | tr '\n' '|' | sed 's/|$//')
CHANGED=()
for f in $(grep -lE "proxy_pass\s+http://(127\.0\.0\.1|localhost):(${PORTS:-0})\b" /etc/nginx/sites-enabled/* 2>/dev/null | xargs -r readlink -f | sort -u); do
  grep -q 'ithub_bad_method' "$f" && continue
  cp -a "$f" "$f.bak.ithub"; CHANGED+=("$f")
  sed -i -E 's/(server_name[^;]*;)/\1\n    if ($ithub_bad_method) { return 405; }/' "$f"
done
if nginx -t 2>/dev/null; then systemctl reload nginx; echo "nginx hardened (Server header removed: $([[ $HM -eq 1 ]] && echo yes || echo 'version hidden only'))"
else echo "!! nginx check failed — restoring the previous configuration"; cp -a "$(ls -t $CONF.bak.* | head -1)" "$CONF"; rm -f "$SNIP"
  for f in "${CHANGED[@]}"; do mv -f "$f.bak.ithub" "$f"; done; nginx -t && systemctl reload nginx; exit 1; fi
for f in "${CHANGED[@]}"; do rm -f "$f.bak.ithub"; done
echo "Sites updated: ${#CHANGED[@]}"
