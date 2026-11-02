# DFO_SHOP_REFRESH_V1
"""Private, queued, single-vendor inventory reads for shop ownership claims.

No write to public vendors.json: the hourly scan remains the only directory writer.
Owner worker already uses an exclusive worker.lock; it processes one refresh per run.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from django.conf import settings

KEY = re.compile(r'^[1-9][0-9]{0,9}/[a-f0-9]{2,256}$')
FRESH_MS = 15 * 60 * 1000


def _path(key, kind):
    if not isinstance(key, str) or not KEY.fullmatch(key):
        raise ValueError('Invalid shop identity')
    folder = Path(settings.PRIVATE) / 'single-shop-refresh'
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    return folder / (hashlib.sha256(key.encode('ascii')).hexdigest() + '.' + kind + '.json')


def _write_atomic(path, obj):
    pending = path.with_name(path.name + '.' + str(os.getpid()) + '.tmp')
    try:
        with pending.open('x', encoding='utf-8') as stream:
            os.chmod(pending, 0o600)
            json.dump(obj, stream, ensure_ascii=False, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def enqueue(key):
    file = _path(key, 'queue')
    try:
        fd = os.open(file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return False
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump({'key': key, 'requestedAt': int(time.time() * 1000)}, stream)
    return True


def status(key):
    if _path(key, 'queue').exists():
        return 'queued'
    p = _path(key, 'state')
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        if data.get('key') == key and 0 <= time.time()*1000 - data.get('at', 0) <= 3600*1000:
            state = data.get('state')
            return state if state != 'ready' or cached(key) else None
    except (ValueError, OSError, TypeError):
        pass
    return None


def cached(key, metadata_only=False):
    """Return independently verified fresh owner-page stock, never public-directory data."""
    p = _path(key, 'cache')
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        proof = data.get('proof', {})
        now = time.time() * 1000
        checked = proof.get('checkedAt', 0)
        shop = proof.get('shop', {})
        mid, hexid = key.split('/', 1)
        vendor_id = bytes.fromhex(hexid).decode('utf-8')
        if (data.get('key') == key and isinstance(checked, (int, float))
                and 0 <= now - checked < (30*86400000 if metadata_only else FRESH_MS)
                and isinstance(shop, dict) and shop.get('map') == int(mid)
                and shop.get('vendorId') == vendor_id
                and shop.get('status') == 'available'
                and isinstance(proof.get('rows'), list) and len(proof['rows']) <= 300):
            if metadata_only:
                return {**proof,'shop':{**shop,'status':'discovered'},'rows':[]}
            return proof
    except (ValueError, OSError, TypeError, UnicodeDecodeError, KeyError, AttributeError):
        pass
    return None


def process_one():
    """Run from the existing scheduled owner worker, never from an HTTP request."""
    folder = Path(settings.PRIVATE) / 'single-shop-refresh'
    if not folder.is_dir():
        return 'idle'
    queue = sorted(folder.glob('*.queue.json'), key=lambda p: p.stat().st_mtime)
    if not queue:
        return 'idle'
    # Avoid extra game API load during the full hourly collector.
    from .discovery import scan_busy, REGIONS
    if scan_busy():
        return 'busy'
    path = queue[0]
    key = None
    result_state = 'failed'
    try:
        entry = json.loads(path.read_text(encoding='utf-8'))
        key = entry['key']
        if path != _path(key, 'queue'):
            raise ValueError('Queue identity mismatch')
        if time.time() * 1000 - entry['requestedAt'] > 120 * 60 * 1000:
            raise ValueError('Queued request expired')
        from portal.domain import shop_stock
        from portal.models import ShopProfile
        shop, _ = shop_stock(key, fresh=False)
        if ShopProfile.objects.filter(key=key, disabled=True).exists():
            raise ValueError('Disabled shop')
        map_id, hexid = key.split('/', 1)
        region=REGIONS.index(shop['region'])
        response = subprocess.run([settings.NODE, settings.GAME_PROBE, map_id, hexid, str(region)],
                                  capture_output=True, timeout=65, check=True)
        if len(response.stdout) > 2 * 1024 * 1024:
            raise ValueError('Proof exceeds limit')
        proof = json.loads(response.stdout)
        now = time.time()*1000
        verified = proof.get('shop', {})
        if (not isinstance(verified, dict)
                or verified.get('map') != int(map_id)
                or verified.get('vendorId') != bytes.fromhex(hexid).decode('utf-8')
                or verified.get('status') != 'available'
                or not isinstance(proof.get('checkedAt'), (int, float))
                or not now-120000 <= proof['checkedAt'] <= now+5000
                or not isinstance(proof.get('rows'), list)
                or len(proof['rows']) > 300):
            raise ValueError('Unexpected shop proof')
        _write_atomic(_path(key, 'cache'), {'key': key, 'proof': proof})
        result_state = 'ready'
    except (ValueError, OSError, subprocess.SubprocessError, TypeError, KeyError, UnicodeDecodeError):
        # Don't print game tokens, player data or raw proof data to logs.
        print('A requested single-shop refresh was unavailable.')
    finally:
        path.unlink(missing_ok=True)
        if key is not None and KEY.fullmatch(key):
            _write_atomic(_path(key, 'state'),
                          {'key': key, 'at': int(time.time()*1000), 'state': result_state})
    return result_state
