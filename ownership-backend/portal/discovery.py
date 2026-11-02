"""Bounded private directory cache and queue. Discovery never grants ownership."""
import json, subprocess, time
from pathlib import Path
from django.conf import settings
from .shop_refresh import _write_atomic

REGIONS=json.loads((Path(__file__).with_name('regions.json')).read_text(encoding='utf-8'))
TTL=3600

def path(region, kind):
    if type(region) is not int or not 0 <= region < len(REGIONS):
        raise ValueError('Invalid region')
    folder=Path(settings.PRIVATE)/'shop-discovery'
    folder.mkdir(mode=0o700,parents=True,exist_ok=True)
    return folder/f'{region}.{kind}.json'

def enqueue(region):
    import os
    try: fd=os.open(path(region,'queue'),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    except FileExistsError: return False
    with os.fdopen(fd,'w') as f: json.dump({'region':region,'at':time.time()},f)
    return True

def cached(region, max_age=TTL):
    from .domain import identity
    try:
        p=path(region,'cache')
        if p.stat().st_size>1024*1024: return None
        data=json.loads(p.read_text(encoding='utf-8'))
        if data.get('region')!=region or not 0<=time.time()*1000-data['checkedAt']<max_age*1000 or not isinstance(data['shops'],list) or len(data['shops'])>600: return None
        for s in data['shops']:
            identity(s)
            if s.get('region')!=REGIONS[region] or s.get('status')!='discovered' or not isinstance(s.get('seller'),str) or len(s['seller'])>64 or s.get('checkedAt')!=data['checkedAt']: return None
        return data
    except (OSError,ValueError,KeyError,TypeError,AttributeError): return None

def find_shop(key):
    from .domain import identity
    found=None
    for region in range(len(REGIONS)):
        # Keep a newer owner label as an unverified hint for the lifetime of an
        # ownership lease. Expiry must not restore an older owner's access.
        data=cached(region,max_age=30*86400)
        if not data: continue
        for s in data['shops']:
            if identity(s)==key and (found is None or s['checkedAt']>found['checkedAt']): found=s
    return found

def state(region):
    if path(region,'queue').exists(): return 'queued'
    try:
        value=json.loads(path(region,'state').read_text())
        if 0<=time.time()-value['at']<TTL and value['state'] in ('ready','failed'): return value['state']
    except (OSError,ValueError,KeyError,TypeError): pass
    return None

def scan_busy():
    try:
        result=subprocess.run(['systemctl','--user','show','dfotimer-vendors.service','--property=ActiveState','--value'],capture_output=True,text=True,timeout=5,check=True)
        return result.stdout.strip() in ('active','activating','deactivating')
    except (OSError,subprocess.SubprocessError): return True

def process_one():
    folder=Path(settings.PRIVATE)/'shop-discovery'
    queue=sorted(folder.glob('*.queue.json'),key=lambda p:p.stat().st_mtime) if folder.exists() else []
    if not queue: return 'idle'
    if scan_busy(): return 'busy'
    p=queue[0];region=None;outcome='failed'
    try:
        request=json.loads(p.read_text());region=request['region']
        if path(region,'queue')!=p or not 0<=time.time()-request['at']<7200: raise ValueError('Expired lookup')
        helper=str(Path(settings.GAME_PROBE).with_name('discover-shops.mjs'))
        result=subprocess.run([settings.NODE,helper,str(region)],capture_output=True,timeout=110,check=True)
        if len(result.stdout)>1024*1024: raise ValueError('Oversized directory')
        data=json.loads(result.stdout)
        if data.get('region')!=region or not 0<=time.time()*1000-data.get('checkedAt',0)<120000: raise ValueError('Invalid directory')
        # Validate before replacing the previous cache; failures remain explicit.
        from .domain import identity
        if not isinstance(data.get('shops'),list) or len(data['shops'])>600: raise ValueError('Invalid directory')
        for s in data['shops']:
            identity(s)
            if s.get('region')!=REGIONS[region] or s.get('status')!='discovered' or s.get('checkedAt')!=data['checkedAt'] or not isinstance(s.get('seller'),str) or len(s['seller'])>64: raise ValueError('Invalid shop')
        _write_atomic(path(region,'cache'),data);outcome='ready'
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError):
        print('A requested public shop discovery was unavailable.')
    finally:
        p.unlink(missing_ok=True)
        if type(region) is int and 0<=region<len(REGIONS): _write_atomic(path(region,'state'),{'at':time.time(),'state':outcome})
    return outcome
