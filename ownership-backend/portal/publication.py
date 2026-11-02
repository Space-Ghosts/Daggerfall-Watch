"""Queue only the public projection returned by our game reader; never claims or credentials."""
import hashlib,json,subprocess
from pathlib import Path
from django.conf import settings
from .domain import identity,KEY
from .shop_refresh import _write_atomic

def queue(proof):
    key=identity(proof['shop'])
    folder=settings.PRIVATE/'public-stock-pending';folder.mkdir(mode=0o700,exist_ok=True)
    _write_atomic(folder/(hashlib.sha256(key.encode()).hexdigest()+'.json'),{k:proof[k] for k in ('checkedAt','shop','rows')})

def publish_inventory():
    helper=Path(settings.GAME_PROBE).with_name('publish-stock.py')
    subprocess.run(['/usr/bin/python3',str(helper),'--output',str(settings.SNAPSHOT),'--pending',str(settings.PRIVATE/'public-stock-pending')],check=True,timeout=30,capture_output=True)

def ready(key):
    if not KEY.fullmatch(key):return False
    p=settings.PUBLIC_ROOT/'shops'/key
    return (p/'index.html').is_file() and (p/'preview.png').is_file()

def publish_pages():
    marker=settings.PRIVATE/'published-export.sha256'
    digest=hashlib.sha256((settings.PRIVATE/'published-profiles.json').read_bytes()+b'\n'+settings.SNAPSHOT.read_bytes()).hexdigest()
    profiles=json.loads((settings.PRIVATE/'published-profiles.json').read_text())
    if not marker.exists() or marker.read_text()!=digest or any(not ready(k) for k in profiles):
        subprocess.run(['systemctl','--user','start','dfotimer-shops.service'],check=True,timeout=180)
        # A successful service exit must also have produced the promised links.
        if any(not ready(k) for k in profiles):raise RuntimeError('Shop publication incomplete; will retry')
        marker.write_text(digest);marker.chmod(0o600)
