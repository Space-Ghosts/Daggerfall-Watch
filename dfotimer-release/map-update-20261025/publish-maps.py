"""Publish verified map assets only, with private backups and an index update last."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import time

os.umask(0o077)
stage = Path('/home/ryan/dfotimer-release/map-update-20261025')
root = Path('/var/www/lastlife-hub/daggerfall')
assert root.is_dir() and not root.is_symlink()
manifest = json.loads((stage / 'map-manifest.json').read_text())
report = manifest['report']
assert report['towns'] > 0 and all(not report[k] for k in ['missingTowns', 'missingVendors', 'hashMismatches'])
names = manifest['files']
assert all(re.fullmatch(r'(vendor-map-data\.js|vendor-map\.js|vendors\.css|vendors\.js|maps/[0-9]+\.json)', name) for name in names)
assert sum(name.startswith('maps/') for name in names) == report['towns']
for name, digest in names.items():
    path = stage / name
    assert path.is_file() and not path.is_symlink() and path.stat().st_size <= 2*1024*1024
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
backup = Path('/home/ryan/dfotimer-release/backups') / ('maps-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
backup.mkdir(parents=True, mode=0o700)
index = (root / 'index.html').read_text()
assert 'src="vendors.js' in index
assert not (root / 'maps').is_symlink()
(root / 'maps').mkdir(exist_ok=True, mode=0o755)
(root / 'maps').chmod(0o755)
for name in list(names) + ['index.html']:
    target = root / name
    assert not target.is_symlink()
    if target.exists():
        (backup / name).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        shutil.copyfile(target, backup / name)
# Map JSON first; module imports and the entry point follow.
for name in sorted(names, key=lambda name: not name.startswith('maps/')):
    temp = root / (name + '.map-next')
    with temp.open('xb') as f:
        f.write((stage / name).read_bytes())
    temp.chmod(0o644)
    temp.replace(root / name)
index = re.sub(r'src="vendors\.js(?:\?[^\"]*)?"', 'src="vendors.js?v=maps-20261025"', index)
index = re.sub(r'href="vendors\.css(?:\?[^\"]*)?"', 'href="vendors.css?v=maps-20261025"', index)
temp = root / 'index.html.map-next'
with temp.open('x') as f:
    f.write(index)
temp.chmod(0o644)
temp.replace(root / 'index.html')
print(f"Published {report['towns']} town maps; {report['buildings']} building anchors. Private backup: {backup}")
