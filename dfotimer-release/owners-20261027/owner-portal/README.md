# Shopkeeper ownership

Deployed 27 October 2026 at `https://dfo.spaceghosts.com/owner/`. Each public shop
has a “Claim or manage your page” link. Separate website credentials; no game
passwords, email, OAuth setup, or messages sent by the bot. This release supports
listing verification. In-game mail verification is not enabled: the reviewed
client inbox exposes a sender handle but not a stable sender account identifier.

## Claim and recovery

Choose an existing public listing. The site assigns a random six-digit gold price
not already in the shop or an active challenge. Cancel and relist exactly one
matching item type/material in that exact vendor. The listing must be new, created
after the challenge starts, and open during a fresh private game-service read.
The server checks the directory owner, shop identity, item, price, currency, quantity,
listing timestamp, expiry and unused listing ID. Browser-provided proof is never
accepted. A challenge lasts two hours; reads are queued and run about once a minute
after clicking Check. It never buys, sells, cancels or sends anything in game.

Website ownership lasts 30 days. Reverification renews it. Reverification from a
different website account revokes the previous account's control and clears its
customizations. This is also recovery when someone loses their website password.
No email/password reset service is implied. Disabled shops cannot be reclaimed.

## Customization and publication

- One banner, center-cropped to 1440×240 (6:1), replacing the visual title and used
  in the Discord card. The accessible shop heading and metadata retain the name.
- Four screenshots with plain-text descriptions; public links open the full image.
- Three preferred live listing IDs, ordered on the Discord card. Missing/sold
  selections fall back to the existing best-stock ordering after scans.
- JPG, PNG or WebP input, single-frame, <=5 MB and <=12 MP. Pillow decodes and
  creates new JPEG pixel buffers without metadata. No SVG/HTML/file paths/URLs.
- Only a sanitized private JSON export and generated JPEGs reach the static shop
  publisher. Credentials, ownership DB, and challenges never enter the webroot.
- Changes publish on the owner worker's next run (normally a few minutes). Existing
  Discord posts can retain Discord's cached card. Inventory still refreshes hourly.

## Boundaries and operations

Django 5.2.18 / Pillow 13.0.0 / Gunicorn 26.2.0, pinned requirements. The web service
binds 127.0.0.1:18803. A single named Caddy route exposes `/owner/*` on the dedicated
DFO hostname only, overwriting Host, origin transport, source-address and a private
proxy key. Other hosts/routes are preserved. A user timer restores the route after
Caddy reloads. The legacy Relay site links to the dedicated-host owner portal.
The local network cannot hairpin the public IP; test TLS locally with curl's
`--resolve dfo.spaceghosts.com:443:192.168.1.211` rather than bypassing certificates.

Framework password hashing, server-side sessions, Secure/HttpOnly/SameSite=Strict
host-only cookies, CSRF and exact-Origin checks, no-store responses, no inline
scripts, bounded bodies, per-account/address/global rate limits, upload storage
budget (2 GiB), no request access logs. HMAC address buckets expire; no raw IPs
are saved by this application. The server's existing web logs are separate.
Unreferenced private uploads are pruned after one hour, unused public images on
publication, expired challenges after seven days, audit records after 90 days.
Inactive profile drafts remain private for recovery. Accounts have no email.

Systemd uses read-only system protection and private temporary storage for the
web service, with writes only in its private directory; game session files and
the SSH directory are inaccessible there. The private worker can read the observer
session through the fixed Node helper. All services still run as the existing
`ryan` user; this is not a separate OS-account isolation boundary.

Operator-only disable: from `/home/ryan/dfotimer-owners`, run
`.venv/bin/python manage.py disable_shop MAP/HEX_VENDOR`, then run or await the
owner worker. `--enable` restores eligibility. This removes customization at the
next publication; it does not change in-game stock. There is no public admin UI.

To roll back: stop `dfotimer-owner-route.timer` and `dfotimer-owner-worker.timer`,
run `python3 route.py --remove`, then stop `dfotimer-owners.service`. Restore the
publisher/template from the release backup and regenerate shops. Preserve the
private database and images unless deletion is explicitly requested.

## Verification

14 Django tests cover proof freshness/replay/wrong identity, recovery revocation,
expired/disabled owners, cross-account editing/image access, CSRF/origin rejection,
featured-listing ownership, image re-encoding and metadata removal, invalid formats,
gallery quotas/escaping, rate limits and the private proxy boundary. Three publisher
tests cover missing/sold inventory, metadata escaping, custom banner composition,
featured fallback, invalid media paths and expired/wrong-owner customization.
Both suites passed before release; Django's suite also passed on Homesec. A fresh
read-only game probe returned Ardgon's actual public stock. A real owner must still
complete a live listing challenge; no shop was claimed for another person in testing.

Design references: [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
[OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
