from pathlib import Path
import json,hashlib,shutil,datetime,os
root=Path('/var/www/lastlife-hub/daggerfall');stage=Path(__file__).resolve().parent
files=['guilds/guild-model.js','guilds/guilds.js','guilds/guilds.css','guilds/index.html','index.html']
baseline=json.loads((stage/'baseline.json').read_text())
for name,digest in baseline.items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,'Live file changed: '+name
for name in files[:-1]:assert not (root/name).exists(),'Existing guild asset: '+name
snapshot=json.loads((root/'guilds/data.json').read_text())
assert snapshot['version']==1 and snapshot['coverage']['seatsChecked']>0,'No verified guild data'
backup=stage.parent/('guilds-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'));backup.mkdir()
for name in files:
    dest=root/name;dest.parent.mkdir(parents=True,exist_ok=True)
    if dest.exists():
        (backup/name).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dest,backup/name)
    tmp=dest.with_name('.guilds-stage-'+dest.name);tmp.write_bytes((stage/name).read_bytes());tmp.chmod(0o644)
done=[]
try:
    for name in files:
        dest=root/name;os.replace(dest.with_name('.guilds-stage-'+dest.name),dest);done.append(name)
    for name in files:assert (root/name).read_bytes()==(stage/name).read_bytes(),name
except Exception:
    for name in reversed(done):
        if (backup/name).exists():shutil.copy2(backup/name,root/name)
        else:(root/name).unlink()
    raise
print(json.dumps({'deployed':files,'backup':str(backup),'guilds':len(snapshot['guilds']),'coverage':snapshot['coverage']}))
