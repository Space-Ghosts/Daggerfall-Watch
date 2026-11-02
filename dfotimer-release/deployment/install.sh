#!/bin/sh
# Run with sudo on Homesec after reviewing this file and dfotimer.caddy.
set -eu
stage=/home/ryan/dfotimer-release
config=/etc/caddy/Caddyfile
site=/var/www/dfotimer
test "$(id -u)" = 0 || { echo 'Run this installer with sudo.' >&2; exit 1; }
test -f "$stage/dist/index.html"
test -f "$stage/deployment/dfotimer.caddy"
if grep -q 'dfotimer.spaceghosts.com' "$config"; then
    echo 'The domain already exists in Caddyfile; review before updating.' >&2
    exit 1
fi
test ! -e "$site" || { echo 'Target already exists; review before installing.' >&2; exit 1; }
test ! -e /etc/caddy/dfotimer.caddy || { echo 'Caddy snippet already exists.' >&2; exit 1; }
candidate=$(mktemp /etc/caddy/Caddyfile.dfotimer.XXXXXX)
backup=/etc/caddy/Caddyfile.before-dfotimer-$(date -u +%Y%m%dT%H%M%SZ)
trap 'rm -f "$candidate"' EXIT
install -d -o root -g root -m 755 "$site"
cp -R "$stage/dist/." "$site/"
chown -R root:root "$site"
find "$site" -type d -exec chmod 755 {} +
find "$site" -type f -exec chmod 644 {} +
install -o root -g root -m 644 "$stage/deployment/dfotimer.caddy" /etc/caddy/dfotimer.caddy
cat "$config" > "$candidate"
printf '\nimport /etc/caddy/dfotimer.caddy\n' >> "$candidate"
caddy validate --config "$candidate" --adapter caddyfile
cp -p "$config" "$backup"
install -o root -g root -m 644 "$candidate" "$config"
if ! systemctl reload caddy; then
    cp -p "$backup" "$config"
    systemctl reload caddy
    echo "Reload failed. Previous configuration restored from $backup" >&2
    exit 1
fi
echo "Installed dfotimer.spaceghosts.com. Backup: $backup"
echo 'Caddy will obtain HTTPS after DNS points to this server and ports 80/443 reach it.'
