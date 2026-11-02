# Daggerfall Watch — source code

Community-built tools for **Daggerfall Online**, including event watching, vendor market browsing, guild/territory views, shop customization/ownership flows, and the dragon tracker.

This repository contains a **source-only snapshot** exported from the owner's HomeSec installation.

## Components

- `website/` (46 files)
- `observer/` (27 files)
- `ownership-backend/` (31 files)
- `private-dragon/` (6 files)
- `dfotimer-admin/` (7 files)
- `dfotimer-host/` (4 files)
- `dfotimer-release/` (146 files)
- `dfotimer-shops/` (3 files)

The public site and collectors were developed for a specific environment. A clone is **not** guaranteed runnable without configuring permitted DFO API access, service processes, and local dependencies. The project is not an official game developer project.

## Deliberately not committed

Player data, marketplace inventories and listings, guild snapshots, shop-generated pages, private location catalogs, database contents, user-uploaded media, auth sessions, cookies, access tokens, credentials, logs, server state, caches, and backups.

The `private-dragon` directory, if present, contains **source code**, not passwords, secrets or live sightings. Publishing its code makes that implementation publicly inspectable.

## Security and privacy

Provide your own application secrets through environment configuration. Do not commit `.env` files, runtime JSON snapshots, populated databases or user images. Source was scanned with automated checks before export, but automated screening is imperfect; maintainers should review all committed files. Do not use this repository as permission to bypass Daggerfall Online's access controls.

## Licensing

No open-source license has been selected. Public visibility permits reading the code; further reuse or redistribution requires the copyright holder's permission unless otherwise permitted by law.
