"""Install only reviewed owner-discovery files, with baseline guards and rollback."""
import base64, hashlib, json, os, pathlib, shutil, subprocess, time
BASE=pathlib.Path('/home/ryan')
PACKAGE=pathlib.Path(__file__).with_name('owner-discovery-payload.json')
entries=json.loads(PACKAGE.read_text())
def service(*args):
    return subprocess.run(['systemctl','--user',*args],check=True,capture_output=True,text=True)
def validate():
    for e in entries:
        p=BASE/e['target']
        if not (str(p).startswith(str(BASE/'dfotimer-owners')+'/') or str(p).startswith(str(BASE/'dfotimer-observer')+'/')): raise RuntimeError('Invalid target')
        if p.is_symlink(): raise RuntimeError('Symlink target')
        actual=hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
        if actual!=e['before']: raise RuntimeError('Live source changed: '+e['target'])
        if hashlib.sha256(base64.b64decode(e['content'])).hexdigest()!=e['after']: raise RuntimeError('Payload mismatch')
validate()
backup=BASE/'dfotimer-release'/('owner-discovery-backup-'+time.strftime('%Y%m%d-%H%M%S',time.gmtime()))
backup.mkdir(mode=0o700)
service('stop','dfotimer-owner-worker.timer')
stopped=False; installed=[]
try:
    state=service('show','dfotimer-owner-worker.service','--property=ActiveState','--value').stdout.strip()
    if state not in ('inactive','failed'): raise RuntimeError('Owner worker busy; retry after completion')
    validate()
    for e in entries:
        p=BASE/e['target']; b=backup/e['target']
        if p.exists():
            b.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,b)
    service('stop','dfotimer-owners.service'); stopped=True
    for e in entries:
        p=BASE/e['target']; tmp=p.with_name(p.name+'.discovery-next')
        tmp.write_bytes(base64.b64decode(e['content'])); tmp.chmod(p.stat().st_mode & 0o777 if p.exists() else 0o644)
        os.replace(tmp,p); installed.append(e)
    subprocess.run([str(BASE/'dfotimer-owners/.venv/bin/python'),'manage.py','check','--deploy'],cwd=BASE/'dfotimer-owners',check=True)
    for n in ('claim-proof.mjs','discover-shops.mjs'):
        subprocess.run(['/usr/bin/node','--check',str(BASE/'dfotimer-observer'/n)],check=True)
    service('start','dfotimer-owners.service')
    service('is-active','dfotimer-owners.service')
    print('DEPLOYED '+str(backup))
except Exception:
    for e in reversed(installed):
        p=BASE/e['target']; b=backup/e['target']
        if b.exists(): shutil.copy2(b,p)
        else: p.unlink(missing_ok=True)
    if stopped: service('restart','dfotimer-owners.service')
    raise
finally:
    service('start','dfotimer-owner-worker.timer')
