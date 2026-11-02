from pathlib import Path
import hashlib,json,datetime,shutil,os
root=Path('/var/www/lastlife-hub/daggerfall')
stage=Path(__file__).resolve().parent
files=['dragon.js','dragon-locations.json','timers.js','app.js','events.json','index.html']
baseline=json.loads((stage/'baseline.json').read_text())
for name,digest in baseline.items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,'Live file changed: '+name
for name in files[:2]:
    assert not (root/name).exists(),'Unexpected existing dragon file: '+name
backup=stage.parent/('dragon-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
backup.mkdir()
for name in files:
    if (root/name).exists():shutil.copy2(root/name,backup/name)
    temp=root/('.dragon-stage-'+name)
    temp.write_bytes((stage/name).read_bytes());temp.chmod(0o644)
done=[]
try:
    for name in files:
        os.replace(root/('.dragon-stage-'+name),root/name);done.append(name)
    for name in files:
        assert (root/name).read_bytes()==(stage/name).read_bytes(),name
except Exception:
    for name in reversed(done):
        if (backup/name).exists():shutil.copy2(backup/name,root/name)
        else:(root/name).unlink()
    raise
print(json.dumps({'deployed':files,'backup':str(backup),'events':len(json.loads((root/'events.json').read_text())['events'])}))
