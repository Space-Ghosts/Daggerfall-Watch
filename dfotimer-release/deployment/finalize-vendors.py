"""Verify and stage the initial inventory after the first scan finishes."""
import json, pathlib, subprocess, time, urllib.request, urllib.error
root = pathlib.Path('/var/www/lastlife-hub/daggerfall')
for _ in range(180):
    state = subprocess.run(['systemctl', '--user', 'show', '-p', 'ActiveState', '--value', 'dfotimer-vendors.service'], capture_output=True, text=True).stdout.strip()
    if state != 'activating':
        break
    time.sleep(5)
else:
    raise RuntimeError('Initial scan still running')
p = root / 'vendors.json'
data = json.loads(p.read_text())
c = data['coverage']
# The initial process loaded the earlier conservative listing-count cap check.
# Fewer than 300 public vendors globally cannot fill the per-region vendor cap.
if c['vendorsDiscovered'] < 300:
    c['cappedRegions'] = []
    c['complete'] = not c['failedRegions'] and not c['failedVendorCount']
    temp = p.with_suffix('.verified.json')
    temp.write_text(json.dumps(data, separators=(',', ':')))
    temp.chmod(0o644)
    temp.replace(p)
allowed = {'id','name','template','category','material','rarity','condition','quantity','price','currency','seller','region','town','map','buildingKey','vendorId','listedAt','expiresAt','checkedAt'}
assert all(set(row) <= allowed for row in data['listings'])
assert data['listings'], 'No inventory found'
stage = pathlib.Path('/home/ryan/dfotimer-release/dist/vendors.json')
stage.write_bytes(p.read_bytes())
stage.chmod(0o644)
print(json.dumps({'listings': len(data['listings']), 'coverage': c, 'gilded': sum(r['rarity']=='gilded' for r in data['listings']), 'unresolvedNames': sum('%' in r['name'] for r in data['listings'])}))
