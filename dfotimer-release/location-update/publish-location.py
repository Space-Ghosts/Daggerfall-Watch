"""Publish the location popup without changing feeds or unrelated staged features."""
from pathlib import Path
import os
import re
import shutil
import time

os.umask(0o077)
stage=Path('/home/ryan/dfotimer-release/location-update')
root=Path('/var/www/lastlife-hub/daggerfall')
backup=Path('/home/ryan/dfotimer-release/backups')/('location-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
backup.mkdir(parents=True,mode=0o700)
assert root.is_dir() and not root.is_symlink()
names=['vendor-map-data.js','vendor-map.js','vendors.css','vendors.js']
assert all((stage/name).is_file() for name in names)
index=(root/'index.html').read_text()
assert 'src="vendors.js' in index
for name in names+['index.html']:
    target=root/name
    assert not target.is_symlink()
    if target.exists(): shutil.copyfile(target,backup/name)
for name in names:
    temp=root/(name+'.location-next')
    with temp.open('xb') as f: f.write((stage/name).read_bytes())
    temp.chmod(0o644)
    temp.replace(root/name)
index=re.sub(r'src="vendors\.js(?:\?[^\"]*)?"','src="vendors.js?v=location-20261024"',index)
index=re.sub(r'href="vendors\.css(?:\?[^\"]*)?"','href="vendors.css?v=location-20261024"',index)
temp=root/'index.html.location-next'
with temp.open('x') as f: f.write(index)
temp.chmod(0o644)
temp.replace(root/'index.html')
print('Published Show location popup and versioned entry points; real town geometry is not yet available.')
