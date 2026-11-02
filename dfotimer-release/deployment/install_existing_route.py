"""Install the static page on Homesec's existing HTTPS host without changing Caddy."""
from pathlib import Path
import shutil

source = Path('/home/ryan/dfotimer-release/dist').resolve()
root = Path('/var/www/lastlife-hub').resolve()
target = root / 'daggerfall'
assert source.is_dir() and (source / 'index.html').is_file()
assert target.parent == root
if target.exists():
    raise SystemExit('Route already exists; refusing to overwrite it.')
shutil.copytree(source, target)
index = target / 'index.html'
index.write_text(index.read_text().replace('https://dfotimer.spaceghosts.com/', 'https://relay.spaceghosts.com/daggerfall/'))
print('Installed https://relay.spaceghosts.com/daggerfall/')
