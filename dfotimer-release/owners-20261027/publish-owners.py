"""Install the owner portal and scoped route, then publish its static integration."""
from pathlib import Path
import hashlib,json,os,secrets,shutil,subprocess,time,urllib.request
os.umask(0o077)
stage=Path('/home/ryan/dfotimer-release/owners-20261027')
app=Path('/home/ryan/dfotimer-owners')
web=Path('/var/www/lastlife-hub/daggerfall')
publisher=Path('/home/ryan/dfotimer-shops')
manifest=json.loads((stage/'manifest.json').read_text())
for name,digest in manifest.items():
    relative=Path(name)
    assert not relative.is_absolute() and '..' not in relative.parts
    assert relative.parts[0] in ['owner-portal','dist','shop-publisher']
    source=stage/relative
    assert source.is_file() and not source.is_symlink() and source.stat().st_size<1024*1024
    assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
backup=Path('/home/ryan/dfotimer-release/backups')/('owners-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
backup.mkdir(mode=0o700)
app.mkdir(mode=0o700,exist_ok=True);private=app/'private';private.mkdir(mode=0o700,exist_ok=True)
for name in ['django-key','proxy-key']:
    target=private/name
    if not target.exists():
        with target.open('x') as f:f.write(secrets.token_urlsafe(48))
        target.chmod(0o600)
def install(source,dest,public=False):
    dest.parent.mkdir(parents=True,exist_ok=True)
    if dest.exists():
        saved=backup/str(dest).lstrip('/');saved.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(dest,saved)
    pending=dest.with_name(dest.name+'.owners-next')
    with pending.open('xb') as f:f.write(source.read_bytes())
    pending.chmod(0o644 if public else 0o600);pending.replace(dest)
for name in manifest:
    if name.startswith('owner-portal/'):
        install(stage/name,app/Path(name).relative_to('owner-portal'))
venv=app/'.venv'
if not venv.exists():subprocess.run(['python3','-m','venv',str(venv)],check=True)
python=str(venv/'bin/python')
subprocess.run([python,'-m','pip','install','--disable-pip-version-check','-r',str(app/'requirements.txt')],check=True)
subprocess.run([python,'manage.py','migrate','--noinput'],cwd=app,check=True)
subprocess.run([python,'manage.py','check','--deploy','--fail-level','WARNING'],cwd=app,check=True)
# Exercise auth/authorization, upload and replay defenses in an isolated test DB.
subprocess.run([python,'manage.py','test','portal','--noinput'],cwd=app,check=True)
units=Path('/home/ryan/.config/systemd/user');units.mkdir(parents=True,exist_ok=True)
for source in app.glob('dfotimer-*'):
    if source.suffix in ('.service','.timer'):install(source,units/source.name)
subprocess.run(['systemctl','--user','daemon-reload'],check=True)
subprocess.run(['systemctl','--user','enable','--now','dfotimer-owners.service'],check=True)
subprocess.run(['systemctl','--user','restart','dfotimer-owners.service'],check=True)
# Verify the private backend before exposing it; never log the proxy key/cookies.
ready=False
for _ in range(12):
    try:
        req=urllib.request.Request('http://127.0.0.1:18803/owner/login/',headers={'Host':'dfo.spaceghosts.com','X-Forwarded-Proto':'https','X-Dfo-Proxy-Key':(private/'proxy-key').read_text().strip(),'X-Dfo-Client-IP':'127.0.0.1'})
        with urllib.request.urlopen(req,timeout=3) as r:
            assert r.status==200 and r.headers['Cache-Control']=='no-store'
            assert b'Sign in to your shop dashboard' in r.read(100000)
        ready=True;break
    except (OSError,AssertionError):time.sleep(1)
assert ready,'Private backend did not pass readiness check; public integration not installed'
for name in manifest:
    if name.startswith('dist/'):install(stage/name,web/Path(name).relative_to('dist'),True)
subprocess.run(['python3','route.py'],cwd=app,check=True)
subprocess.run(['systemctl','--user','enable','--now','dfotimer-owner-route.timer','dfotimer-owner-worker.timer'],check=True)
for name in manifest:
    if name.startswith('shop-publisher/'):install(stage/name,publisher/Path(name).relative_to('shop-publisher'))
subprocess.run(['systemctl','--user','start','dfotimer-shops.service'],check=True)
print('Published shop-owner portal. Backup: '+str(backup))
