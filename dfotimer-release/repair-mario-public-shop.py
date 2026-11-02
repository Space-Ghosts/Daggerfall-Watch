"""One-off repair: publish a freshly read public shop without rescanning the world."""
import fcntl,json,os,pathlib,shutil,subprocess,time
base=pathlib.Path('/home/ryan')
root=pathlib.Path('/var/www/lastlife-hub/daggerfall')
mid=1291010263;hexid='7668697667306635326a6374';vid=bytes.fromhex(hexid).decode()
def ctl(*args):
    return subprocess.run(['systemctl','--user',*args],check=True,capture_output=True,text=True)
def idle():
    assert ctl('show','dfotimer-vendors.service','--property=ActiveState','--value').stdout.strip() in ('inactive','failed'),'Inventory scan busy; no changes made'
with (base/'dfotimer-owners/private/worker.lock').open('a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    timer_active=ctl('show','dfotimer-vendors.timer','--property=ActiveState','--value').stdout.strip()=='active'
    if timer_active: ctl('stop','dfotimer-vendors.timer')
    try:
        idle()
        p=root/'vendors.json';before=p.read_bytes();data=json.loads(before)
        result=subprocess.run(['/usr/bin/node',str(base/'dfotimer-observer/claim-proof.mjs'),str(mid),hexid,'17'],capture_output=True,timeout=65)
        if result.returncode: raise RuntimeError('Fresh public shop read unavailable; no changes made')
        assert len(result.stdout)<2*1024*1024
        proof=json.loads(result.stdout);shop=proof['shop'];rows=proof['rows']
        match=lambda s:s.get('map')==mid and s.get('vendorId')==vid
        assert match(shop) and shop['seller']=='MarioTheShiba' and shop['region']=='Daggerfall' and shop['status']=='available'
        assert 0<=time.time()*1000-proof['checkedAt']<120000 and shop['checkedAt']==proof['checkedAt']
        assert isinstance(rows,list) and 0<len(rows)<=300 and all(match(r) and r['seller']==shop['seller'] for r in rows)
        prior=[s for s in data['shops'] if match(s)]
        data['shops']=[s for s in data['shops'] if not match(s)]+[shop]
        data['listings']=[r for r in data['listings'] if not match(r)]+rows
        # Preserve the last full-scan timestamp and its unresolved coverage.
        coverage=data['coverage']
        if not prior:
            coverage['vendorsDiscovered']+=1;coverage['vendorsChecked']+=1
        backup=base/'dfotimer-release'/('vendors-before-mario-'+time.strftime('%Y%m%d-%H%M%S')+'.json')
        shutil.copy2(p,backup);backup.chmod(0o600)
        idle();assert p.read_bytes()==before,'Inventory changed; refusing overwrite'
        temp=p.with_name('vendors.mario-next.json');temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')));temp.chmod(0o644);os.replace(temp,p)
        ctl('start','dfotimer-shops.service')
        page=root/'shops'/str(mid)/hexid/'index.html'
        assert page.is_file() and 'MarioTheShiba' in page.read_text()
        print(json.dumps({'published':True,'seller':shop['seller'],'town':shop['town'],'listings':len(rows),'path':'/shops/'+str(mid)+'/'+hexid+'/','backup':str(backup)}))
    finally:
        if timer_active:ctl('start','dfotimer-vendors.timer')
