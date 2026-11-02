"""Update only the live canonical URL, preserving all deployed application code."""
from pathlib import Path
from datetime import datetime, timezone
import os
import shutil
root = Path('/var/www/lastlife-hub/daggerfall')
index = root/'index.html'
old = index.read_text()
new = old.replace('https://relay.spaceghosts.com/daggerfall/', 'https://dfo.spaceghosts.com/')
if new != old:
    backup = Path('/home/ryan/dfotimer-host')/('index-before-host-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.html')
    shutil.copyfile(index, backup)
    backup.chmod(0o600)
    pending = root/'.index-host-update.tmp'
    pending.write_text(new)
    pending.chmod(0o644)
    os.replace(pending, index)
    print('Canonical URL updated; deployed application preserved.')
