#!/usr/bin/env python3
"""Install/inspect/uninstall Daggerfall Watch's Discord shop link previews."""
from pathlib import Path
import argparse
import os
import sys
import shutil
sys.dont_write_bytecode = True

ROOT_DEFAULT='/var/www/lastlife-hub/daggerfall'
CRON=Path('/etc/cron.d/dfo-shop-discord-preview')
MARKER='# DFO_SHOP_DISCORD_PREVIEW_20261030'

def write_atomic(path, content, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp=path.with_name(path.name+'.dfo-pending')
    try:
        tmp.write_bytes(content)
        os.chmod(tmp,mode)
        os.replace(tmp,path)
    finally:
        tmp.unlink(missing_ok=True)

def main():
    pa=argparse.ArgumentParser()
    pa.add_argument('root',nargs='?',default=ROOT_DEFAULT)
    mx=pa.add_mutually_exclusive_group()
    mx.add_argument('--check',action='store_true')
    mx.add_argument('--rollback',action='store_true')
    pa.add_argument('--no-schedule',action='store_true',help='local test only: do not install periodic cron')
    args=pa.parse_args()
    root=Path(args.root).resolve()
    local=Path(__file__).resolve().parent/'sync.py'
    script_dir=root/'.dfo-discord'
    script_path=script_dir/'sync.py'
    if not root.is_dir():raise SystemExit('ERROR: Site folder not found: '+str(root))
    if args.rollback:
        from importlib.util import spec_from_file_location,module_from_spec
        source=script_path if script_path.is_file() else local
        spec=spec_from_file_location('shop_sync',source)
        module=module_from_spec(spec);spec.loader.exec_module(module)
        module.rollback(root)
        if CRON.is_file():
            if MARKER in CRON.read_text():CRON.unlink()
            else:raise SystemExit('WARN: Cron file exists but is not ours. Left intact: '+str(CRON))
        (script_dir/'sync.py').unlink(missing_ok=True)
        (script_dir/'install.py').unlink(missing_ok=True)
        (script_dir/'manifest.json').unlink(missing_ok=True)
        pycache = script_dir/'__pycache__'
        if pycache.is_dir(): shutil.rmtree(pycache)
        try:script_dir.rmdir()
        except OSError:pass
        print('PASS: Shop Discord previews rolled back; original Open Graph previews unchanged.')
        return
    if not (root/'vendors.json').is_file():raise SystemExit('ERROR: vendors.json is missing. No changes made.')
    if not (root/'shops').is_dir():raise SystemExit('ERROR: shops folder is missing. No changes made.')
    pages=list((root/'shops').glob('*/*/index.html'))
    if not pages:raise SystemExit('ERROR: No generated shops/*/*/index.html pages found. No changes made.')
    if not local.is_file():raise SystemExit('ERROR: sync.py is missing from the extracted ZIP.')
    if CRON.exists() and MARKER not in CRON.read_text() and not args.no_schedule:
        raise SystemExit('ERROR: an unrelated cron file exists at '+str(CRON))
    from importlib.util import spec_from_file_location,module_from_spec
    spec=spec_from_file_location('shop_sync',local)
    module=module_from_spec(spec);spec.loader.exec_module(module)
    if args.check:
        return_code=module.sync(root,True)
        if return_code:raise SystemExit('ERROR: Preflight found problematic shop pages. No changes made.')
        print('PASS: Ready to install. Existing OG meta/images preserved. Up to 28 readable listings per shop.')
        return
    script_dir.mkdir(parents=True,exist_ok=True)
    write_atomic(script_path,local.read_bytes())
    write_atomic(script_dir/'install.py',Path(__file__).resolve().read_bytes())
    result=module.sync(root,False)
    if result:
        raise SystemExit('ERROR: Some shop pages failed; inspect output. No recurring refresh installed.')
    if not args.no_schedule:
        cron=(MARKER+'\n'
             '*/5 * * * * root /usr/bin/python3 '+str(script_path)+' '+str(root)+' >/dev/null 2>&1\n')
        write_atomic(CRON,cron.encode())
    print('PASS: Discord shop previews installed. Generated pages are refreshed every five minutes.' if not args.no_schedule else 'PASS: Local installation complete (no schedule).')
    print('ROLLBACK: sudo python3 '+str(script_dir/'install.py')+' '+str(root)+' --rollback')

if __name__=='__main__':main()
