#!/usr/bin/env python3
"""Maintain server-rendered Discord component links for Daggerfall Watch shops.
No authentication, crawler, or Discord API. Reads only local public vendors.json.
"""
from __future__ import annotations
import argparse
import html
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, urljoin, unquote

ORIGIN = 'https://dfo.spaceghosts.com'
LINK_MARKER = '<!-- DFO_DISCORD_SHOP_PREVIEW_START -->'
LINK_END = '<!-- DFO_DISCORD_SHOP_PREVIEW_END -->'
MAX_BYTES = 3000
TARGET_LISTINGS = 28
RANK = {'gilded': 0, 'aetheric': 1, 'artifact': 2, 'legendary': 3, 'rare': 4, 'magic': 5, 'common': 6}
# Discord text displays cannot set individual foreground colors; color dots match
# the user-confirmed rarity colors for Daggerfall Watch.
RARITY_DOT = {'gilded': '🔴', 'aetheric': '🩵', 'artifact': '🟣', 'legendary': '🟠', 'rare': '🟡', 'magic': '🔵', 'common': '⚪'}
MATERIALS_PREVIEW_V2 = 'materials-rarity-correct-20261030'
VALID_SHOP = re.compile(r'^shops/([1-9]\d{0,9})/([0-9a-f]{2,256})/index\.html$')

class ShopMeta(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = {}
    def handle_starttag(self, tag, attrs):
        if tag.lower() != 'meta':
            return
        a = dict(attrs)
        name = a.get('property') or a.get('name')
        if name and a.get('content'):
            self.tags[name.lower()] = a['content']


def clean(text, limit=90):
    s = str(text or '').replace('\n', ' ').replace('\r', ' ').strip()
    s = re.sub(r'\s+', ' ', s)
    # Neutralize Discord formatting, mentions and injected markdown links.
    s = s.replace('\\', '').replace('@', '@\u200b').replace('`', "'")
    for c in '*_~|<>[]()':
        s = s.replace(c, '')
    return s[:limit]


def qty_int(n, default=0):
    try:
        return max(0, int(n))
    except (TypeError, ValueError, OverflowError):
        return default


def price_text(r):
    price = qty_int(r.get('price'))
    unit = clean(r.get('currency') or 'gold', 14).lower()
    if unit not in ('gold', 'marks', 'silver', 'drakes'):
        unit = 'gold'
    return f'{price:,} {unit}'


def millis_timestamp(n):
    try:
        v = float(n)
        return v if v > 10**12 else v * 1000
    except (TypeError, ValueError, OverflowError):
        return 0


def slug_identity(path):
    m = VALID_SHOP.fullmatch(path)
    if not m:
        return None
    try:
        vendor = bytes.fromhex(m[2]).decode('utf-8')
    except (ValueError, UnicodeError):
        return None
    if not vendor or len(vendor) > 128 or any(ord(c) < 32 or ord(c) == 127 for c in vendor):
        return None
    return int(m[1]), vendor


def item_key(row):
    try:
        return int(row.get('map')), str(row.get('vendorId'))
    except (TypeError, ValueError, AttributeError):
        return None


def origin_image(page_html, shop_url):
    meta = ShopMeta()
    meta.feed(page_html[:22000])
    raw = meta.tags.get('og:image') or meta.tags.get('twitter:image')
    if not raw:
        return None
    url = urljoin(shop_url, raw)
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'dfo.spaceghosts.com':
        return None
    # Must be an actual image URL; don't reference non-image handler paths.
    if not re.search(r'\.(?:png|jpe?g|webp|gif|avif)(?:$|\?)', parsed.path, re.I):
        return None
    return url[:2048]


def make_component(shop, rows, shop_url, image_url, updated_at):
    label = clean(shop.get('seller') or 'Player', 60)
    town = clean(shop.get('town') or 'Unknown town', 50)
    region = clean(shop.get('region') or '', 48)
    location = ' · '.join(x for x in (town, region) if x)
    total = len(rows)
    title = f'**{label}’s shop**'
    title_sub = f'{location} · {total:,} active listing' + ('s' if total != 1 else '')
    components = [
        {'type': 10, 'content': f'{title}\n{title_sub}'},
    ]
    # The existing OG art *already contains both custom banner and town map*.
    # Reusing the original asset retains the existing artwork exactly, no image generation or cropping needed.
    if image_url:
        components.append({'type': 12, 'items': [{'media': {'url': image_url}, 'description': 'Custom shop banner, featured inventory and in-game shop location map'}]})
    components += [{'type': 14, 'spacing': 1}, {'type': 10, 'content': ''}]
    stock = components[-1]
    components.append({'type': 1, 'components': [{'type': 2, 'style': 5, 'url': shop_url, 'label': 'View full shop'}]})
    component = {'component': {'type': 17, 'accent_color': 8272980, 'components': components}}

    def encoded():
        return json.dumps(component, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')

    freshness = datetime.fromtimestamp(updated_at / 1000, tz=timezone.utc).strftime('%d %b %Y %H:%M UTC') if updated_at else 'time unavailable'
    footer = f'Inventory checked {freshness} · Stock may sell'
    headline = '**Stock · gilded and rare first**'
    text = headline
    used = 0
    # Budget per payload, not just per text. Do not truncate in the middle of an item.
    for row in rows[:TARGET_LISTINGS]:
        name = clean(row.get('name') or 'Unnamed item', 72)
        qty = qty_int(row.get('quantity'), 1)
        rarity = str(row.get('rarity') or '').strip().lower()
        dot = RARITY_DOT.get(rarity, '⚪')
        # From vendors.json, never guessed from item names. No material field:
        # omit it rather than mislabel an enchanted or special item.
        raw_material = row.get('material')
        material = clean(raw_material, 30) if isinstance(raw_material, str) else ''
        display_name = f'{name} · {material}' if material else name
        line = f'\n• {dot} **{display_name}** — {price_text(row)}' + (f' ×{qty}' if qty > 1 else '')
        remain = total - used - 1
        suffix = (f'\n+{remain:,} more — open shop for all listings' if remain > 0 else '') + '\n' + footer
        stock['content'] = text + line + suffix
        if len(encoded()) > MAX_BYTES:
            break
        text += line
        used += 1
    remaining = total - used
    suffix = (f'\n+{remaining:,} more — open shop for all listings' if remaining > 0 else '') + '\n' + footer
    stock['content'] = text + suffix if total else 'No active inventory in the latest scan.\n' + footer
    if len(encoded()) > MAX_BYTES:
        # In the extremely unlikely case of an oversized image URL / shop info,
        # keep legitimate location and shop button; omit artwork only if necessary.
        if image_url:
            components[:] = [c for c in components if c.get('type') != 12]
        if len(encoded()) > MAX_BYTES:
            stock['content'] = 'See current items and prices in the full shop.\n' + footer
    payload = encoded()
    if len(payload) > MAX_BYTES:
        raise ValueError(f'payload too long: {len(payload)} bytes')
    return payload, used


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.dfo-preview-', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(content)
        if path.exists():
            st = path.stat()
            # The vendor collector may not run as root. Never change ownership
            # or its ability to rewrite a generated shop index.html.
            os.chown(tmp, st.st_uid, st.st_gid)
            os.chmod(tmp, st.st_mode & 0o777)
        else:
            # Files next to the shop HTML may be served by nginx, not just root.
            st = path.parent.stat()
            os.chown(tmp, st.st_uid, st.st_gid)
            os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def apply_link(original, page_url):
    if LINK_MARKER in original:
        original = re.sub(re.escape(LINK_MARKER) + r'.*?' + re.escape(LINK_END) + r'\s*', '', original, flags=re.S)
    if not re.search(r'</head\s*>', original, re.I):
        raise ValueError('no head close')
    link = (LINK_MARKER + '\n'
            '<link rel="discord:component-embed" type="application/json" href="' + html.escape(page_url + 'discord-preview.json', quote=True) + '">\n'
            + LINK_END + '\n')
    return re.sub(r'</head\s*>', lambda m: link + m.group(0), original, count=1, flags=re.I)


def unlink_tag(original):
    return re.sub(re.escape(LINK_MARKER) + r'.*?' + re.escape(LINK_END) + r'\s*', '', original, flags=re.S)


def sync(root, dry_run=False):
    source = root / 'vendors.json'
    data = json.loads(source.read_text())
    if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('listings'), list):
        raise ValueError('vendors.json is not a valid Daggerfall Watch v1 snapshot')
    allshops = data.get('shops') or []
    if not isinstance(allshops, list):
        allshops = []
    shops = {item_key(s): s for s in allshops if isinstance(s, dict)}
    updated_at = millis_timestamp(data.get('updatedAt'))
    now_ms = __import__('time').time() * 1000
    byshop = {}
    for row in data['listings']:
        if not isinstance(row, dict):
            continue
        key = item_key(row)
        if key is None:
            continue
        if millis_timestamp(row.get('expiresAt')) <= now_ms:
            continue
        byshop.setdefault(key, []).append(row)
    for items in byshop.values():
        items.sort(key=lambda r: (RANK.get(str(r.get('rarity')).lower(), 7), str(r.get('name') or '').casefold(), qty_int(r.get('price'))))
    manifest_path = root / '.dfo-discord' / 'manifest.json'
    try:
        manifest = json.loads(manifest_path.read_text())
        if not isinstance(manifest, list): manifest = []
    except (OSError, ValueError):
        manifest = []
    touched = set(manifest)
    seen = 0
    changed = 0
    total_rows = 0
    failures = []
    for page in (root/'shops').glob('*/*/index.html'):
        rel = str(page.relative_to(root))
        ident = slug_identity(rel)
        if not ident:
            continue
        seen += 1
        try:
            source_html = page.read_text(encoding='utf-8')
            current_shop = shops.get(ident) or next(iter(byshop.get(ident, [])), None)
            shop_url = ORIGIN + '/' + rel[:-len('index.html')]
            if not current_shop or current_shop.get('status') in ('unavailable', 'not-listed'):
                # Stop showing stale data if the shop is no longer in the inventory.
                new_html = unlink_tag(source_html)
                if not dry_run and new_html != source_html:
                    atomic_write(page, new_html.encode('utf-8'));changed += 1
                if not dry_run:
                    (page.parent/'discord-preview.json').unlink(missing_ok=True)
                continue
            payload, used = make_component(current_shop, byshop.get(ident, []), shop_url, origin_image(source_html, shop_url), updated_at)
            new_html = apply_link(source_html, shop_url)
            target = page.parent/'discord-preview.json'
            if not dry_run:
                if not target.exists() or target.read_bytes() != payload:
                    atomic_write(target,payload)
                if new_html != source_html:
                    atomic_write(page,new_html.encode('utf-8'));changed += 1
            touched.add(rel)
            total_rows += used
        except Exception as e:
            failures.append(f'{rel}: {e}')
    if seen == 0:
        print('ERROR: No shop page names matched the expected numeric-map/hex-vendorId layout',file=sys.stderr)
        return 1
    if not dry_run and touched != set(manifest):
        atomic_write(manifest_path,json.dumps(sorted(touched),indent=1).encode())
    print(f'{"CHECK" if dry_run else "PASS"}: {seen} shop pages; {changed} HTML updates; {total_rows} stock entries featured; {len(failures)} errors')
    for e in failures[:10]: print('WARN:',e,file=sys.stderr)
    return 0 if not failures else 1


def rollback(root):
    manifest_path=root/'.dfo-discord'/'manifest.json'
    try: manifest=json.loads(manifest_path.read_text())
    except (OSError, ValueError): manifest=[]
    restored=0
    for rel in manifest:
        if not isinstance(rel,str) or not slug_identity(rel):continue
        page=root/rel
        if not page.is_file():continue
        original=page.read_text()
        cleaned=unlink_tag(original)
        if cleaned!=original:
            atomic_write(page, cleaned.encode());restored+=1
        (page.parent/'discord-preview.json').unlink(missing_ok=True)
    print(f'PASS: removed preview links from {restored} pages')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('root',type=Path)
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--rollback',action='store_true')
    args=parser.parse_args()
    root=args.root.resolve()
    if args.rollback:
        rollback(root);return
    if not (root/'vendors.json').is_file():raise SystemExit('ERROR: vendors.json not found in '+str(root))
    if not (root/'shops').is_dir():raise SystemExit('ERROR: shops directory not found in '+str(root))
    sys.exit(sync(root,args.check))
if __name__=='__main__': main()
