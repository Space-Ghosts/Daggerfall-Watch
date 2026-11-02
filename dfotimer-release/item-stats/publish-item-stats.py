"""Deploy the item-stat UI after the private scanner has been updated."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,time
stage=Path('/home/ryan/dfotimer-release/item-stats')
root=Path('/var/www/lastlife-hub/daggerfall')
publisher=Path('/home/ryan/dfotimer-shops')
files=['vendor-details.js','vendor-search.js','vendors.js','shop-page.js','shop-page.css','template.html','publish.py']
manifest=json.loads((stage/'manifest.json').read_text())
assert set(manifest)==set(files)
for name in files:
    assert hashlib.sha256((stage/name).read_bytes()).hexdigest()==manifest[name]
backup=Path('/home/ryan/dfotimer-release/backups')/('item-stats-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
backup.mkdir(mode=0o700)
for name in files:
    dest=(publisher if name in ['template.html','publish.py'] else root)/name
    if dest.exists():shutil.copyfile(dest,backup/name)
    pending=dest.with_name(dest.name+'.stats-next')
    with pending.open('xb') as f:f.write((stage/name).read_bytes())
    pending.chmod(0o600 if dest.parent==publisher else 0o644);pending.replace(dest)
index=root/'index.html';shutil.copyfile(index,backup/'index.html')
body=re.sub(r'src="vendors\.js(?:\?[^\"]*)?"','src="vendors.js?v=stats-20261027"',index.read_text())
pending=root/'index.html.stats-next'
with pending.open('x') as f:f.write(body)
pending.chmod(0o644);pending.replace(index)
subprocess.run(['systemctl','--user','start','dfotimer-shops.service'],check=True)
print('Published item-stat UI. Backup: '+str(backup))
