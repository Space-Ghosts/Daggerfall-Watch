"""Guarded backend-only update. Does not touch public pages or owner code."""
from pathlib import Path
import datetime, hashlib, json, shutil, subprocess

stage=Path('/home/ryan/dfotimer-release/market-retries-20261028')
root=Path('/home/ryan/dfotimer-observer')
manifest=json.loads((stage/'retry-manifest.json').read_text())
for name,digest in manifest['baseline'].items():
    if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:
        raise SystemExit('Live baseline changed: '+name)
for name,digest in manifest['files'].items():
    if hashlib.sha256((stage/name).read_bytes()).hexdigest()!=digest:
        raise SystemExit('Staged checksum mismatch: '+name)
    subprocess.run(['node','--check',str(stage/name)],check=True)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=Path('/home/ryan/dfotimer-release/backups')/('market-retries-'+stamp)
backup.mkdir(parents=True)
for name in manifest['files']:
    if (root/name).exists(): shutil.copy2(root/name,backup/name)
# A stopped scan has not published partial output; its last atomic snapshot stays.
subprocess.run(['systemctl','--user','stop','dfotimer-vendors.service'],check=True)
for name in ['market-reader.mjs','vendor-core.mjs','vendor-scan.mjs']:
    pending=root/(name+'.retry-update')
    shutil.copyfile(stage/name,pending)
    pending.chmod(0o644)
    pending.replace(root/name)
subprocess.run(['systemctl','--user','start','--no-block','dfotimer-vendors.service'],check=True)
print('Retry and diagnostics update installed; fresh scan started. Backup:',backup)
