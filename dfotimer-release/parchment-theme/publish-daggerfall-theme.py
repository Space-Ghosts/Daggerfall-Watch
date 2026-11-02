"""Apply the public Daggerfall visual theme without replacing live data or scripts."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,time
root=Path('/var/www/lastlife-hub/daggerfall')
publisher=Path('/home/ryan/dfotimer-shops')
stage=Path('/home/ryan/dfotimer-release/parchment-theme')
files=['daggerfall-theme.css','favicon.svg','template.html','publish.py']
manifest=json.loads((stage/'manifest.json').read_text())
assert set(manifest)==set(files)
for name in files:assert hashlib.sha256((stage/name).read_bytes()).hexdigest()==manifest[name]
backup=Path('/home/ryan/dfotimer-release/backups')/('parchment-theme-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
backup.mkdir(mode=0o700)
for name in files:
    dest=(publisher if name in ['template.html','publish.py'] else root)/name
    if dest.exists():shutil.copyfile(dest,backup/name)
    pending=dest.with_name(dest.name+'.theme-next')
    with pending.open('xb') as f:f.write((stage/name).read_bytes())
    pending.chmod(0o600 if dest.parent==publisher else 0o644);pending.replace(dest)
index=root/'index.html';shutil.copyfile(index,backup/'index.html')
body=index.read_text()
body=re.sub(r'<link rel="stylesheet" href="daggerfall-theme\.css[^\"]*">','',body)
body=body.replace('</head>','<link rel="stylesheet" href="daggerfall-theme.css?v=parchment-20261027-readable3">\n</head>')
body=re.sub(r'(<meta name="theme-color" content=")[^\"]*(")',r'\g<1>#302a22\2',body)
body=body.replace('ILIAC BAY EVENT NETWORK','THE ILIAC BAY CHRONICLE')
pending=root/'index.html.theme-next'
with pending.open('x') as f:f.write(body)
pending.chmod(0o644);pending.replace(index)
subprocess.run(['systemctl','--user','start','dfotimer-shops.service'],check=True)
print('Published Daggerfall theme. Backup: '+str(backup))
