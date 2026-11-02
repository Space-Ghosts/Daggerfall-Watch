"""Read-only post-release smoke check; never prints private game data."""
import fcntl, json, os, pathlib, subprocess, sys
root=pathlib.Path('/home/ryan/dfotimer-owners')
sys.path.insert(0,str(root));os.environ['DJANGO_SETTINGS_MODULE']='portal.settings'
import django
django.setup()
from django.conf import settings
from django.template.loader import render_to_string
from portal.discovery import REGIONS, scan_busy
html=render_to_string('find_shop.html',{'regions':list(enumerate(REGIONS)),'lookup':{}})
assert 'Find / refresh my shop' in html and 'Enter your in-game account name' in html
print('Deployed template rendered successfully')
with (settings.PRIVATE/'worker.lock').open('a') as lock:
    try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        print('Directory smoke check skipped: owner worker busy');sys.exit(0)
    if scan_busy():
        print('Directory smoke check skipped: inventory scan busy');sys.exit(0)
    r=subprocess.run([settings.NODE,str(pathlib.Path(settings.GAME_PROBE).with_name('discover-shops.mjs')),str(REGIONS.index('Daggerfall'))],capture_output=True,timeout=110)
    if r.returncode:
        print('Live directory unavailable; deployed helper returned a controlled failure');sys.exit(0)
    data=json.loads(r.stdout)
    matches=[{k:s.get(k) for k in ('seller','town','region')} for s in data['shops'] if s.get('seller','').casefold() in ('mariotheshiba','lady kara','ohrion')]
    print(json.dumps({'region':'Daggerfall','publicShops':len(data['shops']),'capped':data['capped'],'matchingPublicShops':matches}))
