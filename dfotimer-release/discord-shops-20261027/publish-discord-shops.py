"""Publish preview-ready static shops without replacing feeds or proxy config."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
os.umask(0o077)
stage=Path('/home/ryan/dfotimer-release/discord-shops-20261027')
root=Path('/var/www/lastlife-hub/daggerfall')
manifest=json.loads((stage/'manifest.json').read_text())
for name,digest in manifest['files'].items():
    assert re.fullmatch(r'(vendor-map\.js|vendor-shop\.js|vendors\.js|shop-page\.js|shop-page\.css|maps/[0-9]+\.json)',name)
    path=stage/name
    assert path.is_file() and not path.is_symlink() and path.stat().st_size<=2*1024*1024
    assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
assert manifest['report']['towns']==382
assert not any(manifest['report'][key] for key in ['missingTowns','missingVendors','hashMismatches'])
baseline={'vendors.js':'348b46250141f5b5070851d382a65b22925ecc5497173714e046e4cc4e44e3b5','vendor-shop.js':'e1e0d6e589d0e00e4d8728e3010d1e77843912c99d9105ac49d1703317675224','vendor-map.js':'853de007c26b26cc1e6c01cc1e22adcf07ecbb359a0f3784e8d00fdcddbdf91c'}
for name,digest in baseline.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,'Live source changed: '+name
backup=Path('/home/ryan/dfotimer-release/backups')/('discord-shops-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
backup.mkdir(parents=True,mode=0o700)
for name in list(manifest['files'])+['index.html']:
    target=root/name
    assert not target.is_symlink()
    if target.exists():
        (backup/name).parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(target,backup/name)
def put(name):
    target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.parent.chmod(0o755)
    pending=target.with_name(target.name+'.discord-next')
    with pending.open('xb') as file:file.write((stage/name).read_bytes())
    pending.chmod(0o644);pending.replace(target)
for name in manifest['files']:
    if name!='vendors.js':put(name)
# Generate every current shop before enabling links from the marketplace.
subprocess.run(['/home/ryan/dfotimer-shops/.venv/bin/python','/home/ryan/dfotimer-shops/publish.py','--root',str(root),'--state','/home/ryan/dfotimer-shops/private'],check=True)
put('vendors.js')
index=(root/'index.html').read_text()
assert 'src="vendors.js' in index
index=re.sub(r'src="vendors\.js(?:\?[^\"]*)?"','src="vendors.js?v=discord-20261027"',index)
pending=root/'index.html.discord-next'
with pending.open('x') as file:file.write(index)
pending.chmod(0o644);pending.replace(root/'index.html')
print('Published standalone shops, Discord metadata/cards and refreshed maps. Backup: '+str(backup))
