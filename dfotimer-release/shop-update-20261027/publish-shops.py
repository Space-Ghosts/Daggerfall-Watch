"""Publish only shareable shop files; preserve live feeds and unrelated features."""
from pathlib import Path
import hashlib
import os
import re
import shutil
import subprocess
import time

os.umask(0o077)
stage=Path('/home/ryan/dfotimer-release/shop-update-20261027')
root=Path('/var/www/lastlife-hub/daggerfall')
observer=Path('/home/ryan/dfotimer-observer')
baseline={
 'vendors.js':'7cdef75490fa294096e93ddce4495d550ac6f49c3bf032be16f08b3766826bb1',
 'vendors.css':'c3dace156fd09ea41cccd0fcb3237181577d38be7392d43f3f05b520fac37cc4',
 'vendor-map.js':'56cb03d55e6059207be842293e6e7c3efe86fc41fd4aabee686bc9ea5ac22318',
}
for name,digest in baseline.items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,'Live file changed: '+name
assert hashlib.sha256((observer/'vendor-core.mjs').read_bytes()).hexdigest()=='63b1c56f05f965a755f8130eeb2a0e5f62f46833bfde89a5f4ef9fdf28d3c9e8','Scanner changed'
for name in ['vendors.js','vendor-shop.js','vendor-map.js','vendor-core.mjs']:
 subprocess.run(['/usr/bin/node','--check',str(stage/name)],check=True)
backup=Path('/home/ryan/dfotimer-release/backups')/('shops-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
backup.mkdir(parents=True,mode=0o700)
names=['vendor-shop.js','vendor-map.js','vendors.css','vendors.js']
for name in names+['index.html']:
 target=root/name
 assert not target.is_symlink()
 if target.exists():shutil.copyfile(target,backup/name)
shutil.copyfile(observer/'vendor-core.mjs',backup/'vendor-core.mjs')
def publish(source,target,mode):
 pending=target.with_name(target.name+'.shops-next')
 with pending.open('xb') as file:file.write(source.read_bytes())
 pending.chmod(mode);pending.replace(target)
for name in names:publish(stage/name,root/name,0o644)
publish(stage/'vendor-core.mjs',observer/'vendor-core.mjs',0o600)
index=(root/'index.html').read_text()
assert 'src="vendors.js' in index and 'href="vendors.css' in index
index=re.sub(r'src="vendors\.js(?:\?[^\"]*)?"','src="vendors.js?v=shops-20261027"',index)
index=re.sub(r'href="vendors\.css(?:\?[^\"]*)?"','href="vendors.css?v=shops-20261027"',index)
pending=root/'index.html.shops-next'
with pending.open('x') as file:file.write(index)
pending.chmod(0o644);pending.replace(root/'index.html')
for name in names:
 assert (stage/name).read_bytes()==(root/name).read_bytes()
print('Published shop pages and scanner metadata. Existing feeds retained. Backup: '+str(backup))
