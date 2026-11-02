# Read-only DFO observer

Runs as Homesec user `ryan`, with a dedicated Event Watcher account (initially a guest; upgraded by the user to registered on 2026-10-24 for vendor-directory access). The only game socket messages sent are `hello` and `ping`. No seat claim, gameplay, reward collection, player movement, chat, or account play-time heartbeat is sent. One connection follows the world hub's authenticated shard redirect. Policy/seat refusals stop reconnecting; network failures use exponential backoff capped at five minutes. A fresh connection every six hours renews snapshots and authentication.

## Guest setup

`setup.mjs` binds only to `127.0.0.1:18790` on Homesec. Reach it through SSH forwarding to the same local port. The user must review and accept the linked game terms/privacy policy before creating the guest. The page validates Host, Origin, a random CSRF token, and a bounded request body. It has no public route. It shuts down after successful setup; the temporary systemd unit also has a two-hour runtime limit.

Guest identity and session credentials stay in `private/session.json` (directory 0700, file 0600), outside the web root. Do not copy this directory into a release or publish logs containing credentials. Do not create another guest if one has already been saved. Terms versions are checked by the official game service and must be reviewed again if changed. The game also requires an online realm character. `prepare-character.mjs` registers one named Event Watcher through the normal API, only after explicit user approval, and persists its issued ID privately. No save, stats, equipment, or progress is uploaded. Do not rerun registration against another account.

## Service

Install `dfotimer-observer.service` under `~/.config/systemd/user/`, run `systemctl --user daemon-reload`, then enable it. The setup page starts it after saving the guest. Homesec already has user lingering enabled. Dependencies are installed with `npm ci --ignore-scripts` from the lockfile.

`systemctl --user status dfotimer-observer.service` shows status; `systemctl --user stop dfotimer-observer.service` stops it. Logs contain generic connection/errors only. A stopped/refused observer requires diagnosis before a manual restart.

## Published feed

Only explicitly projected event fields reach `/var/www/lastlife-hub/daggerfall/live.json`. Writes use atomic rename. No game secret, token, receipt/signature, roster, chat, or player name is exported. History is bounded to 256 reports per type. The static page polls every 20 seconds while visible. Feeds older than 65 seconds (or without recent server traffic) fall back to published schedules.

The initial feed supports Abyss lifecycle, Dagon boss defeat, site-specific serpent defeat, collected Starfall reports, and town-raid clears. It does not provide a complete list of currently active raids. Raid town-name lookup still needs game map data. Missing completion reports never imply that an event is active.

Protocol reference: https://github.com/Lattymoy/daggerfall-js-source (`src/net/accountClient.js`, `legalLaw.js`, `online.js`, `wire.js`, `hubShards.js`, `server/src/index.js`).

Verified 23 October 2026: user created the guest and explicitly approved Event Watcher registration. Authenticated shard connection succeeded, delivering 39 raid-clear snapshot reports and Abyss slot 110 in the risen phase. Heartbeats continued and the public timer displayed Live + rules, live raid reports, and the server Abyss expiry. This confirms the connection and these two observed message types; gate, serpent, and Starfall projection are source-based and tested with fixtures until those events arrive.

If moving to the dedicated dfotimer host, change `DFO_OUTPUT` to that host's public `live.json` path and ensure the service can atomically write there. Do not move private guest files into either web root.

## Vendor scanner

The separate `dfotimer-vendors.service` reads all regional public vendor directories and the full stock of discovered public vendors. `dfotimer-vendors.timer` runs about hourly. It uses the existing registered session without another online game character or socket connection. See the project README for coverage, freshness, public-field projection, and deployment details.

The private upgrade helper `vendor-account-setup.mjs` binds loopback port 18791 and requires the user to choose credentials and accept terms. It upgrades the existing account, preserving the session and Event Watcher character. The password is not stored; recovery codes appear only in the user's response. The form shuts down after success. Its SSH tunnel was closed after the completed upgrade. Never run this helper publicly or include the private session in a release.
