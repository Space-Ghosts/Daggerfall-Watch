"""Serialized public inventory writer shared by full scans and private shop refreshes."""
import argparse,contextlib,hashlib,json,os,time
from pathlib import Path

def key(s):
    mid=s.get('map');v=s.get('vendorId')
    if type(mid) is not int or not 0<mid<=0xffffffff or not isinstance(v,str) or not 1<=len(v)<=128 or any(ord(c)<32 for c in v): raise ValueError('Invalid shop')
    return str(mid)+'/'+v.encode().hex()

def validate(proof,now):
    s=proof['shop'];rows=proof['rows'];at=proof['checkedAt'];k=key(s)
    if type(at) not in (int,float) or not now-7200000<at<=now+5000 or s.get('checkedAt')!=at or s.get('status')!='available': raise ValueError('Stale proof')
    if not isinstance(s.get('seller'),str) or not s['seller'] or len(s['seller'])>64 or not isinstance(rows,list) or len(rows)>300: raise ValueError('Invalid proof')
    for r in rows:
        if key(r)!=k or r.get('seller')!=s['seller'] or r.get('checkedAt')!=at or type(r.get('quantity')) is not int or r['quantity']<1 or type(r.get('price')) is not int or r['price']<0 or type(r.get('expiresAt')) not in (int,float): raise ValueError('Invalid stock')
    return k

def merge(snapshot,proofs,now):
    # A scan started before a targeted read must not erase that newer read when it finishes.
    since=snapshot.get('startedAt',snapshot['updatedAt'])
    applied=snapshot.setdefault('shopRefreshes',{})
    for proof in sorted(proofs,key=lambda p:p['checkedAt']):
        try:k=validate(proof,now)
        except (KeyError,TypeError,ValueError):continue
        at=proof['checkedAt']
        if at<=since or at<=applied.get(k,0):continue
        old=[s for s in snapshot['shops'] if key(s)==k]
        if old and (old[0].get('checkedAt') or 0)>=at:continue
        snapshot['shops']=[s for s in snapshot['shops'] if key(s)!=k]+[proof['shop']]
        snapshot['listings']=[r for r in snapshot['listings'] if key(r)!=k]+[r for r in proof['rows'] if r['expiresAt']>now]
        c=snapshot.get('coverage',{})
        if not old:
            for field in ('vendorsDiscovered','vendorsChecked'):
                if field in c:c[field]+=1
        elif old[0].get('status')=='unavailable':
            if 'vendorsChecked' in c:c['vendorsChecked']+=1
            if c.get('failedVendorCount',0)>0:c['failedVendorCount']-=1
        # Do not upgrade overall completeness based on an isolated refresh.
        applied[k]=at
    return snapshot

def write(output,pending,incoming=None):
    import fcntl
    pending.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (pending.parent/'public-stock.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        before=output.read_bytes() if output.exists() else b''
        snapshot=incoming if incoming is not None else json.loads(before)
        if snapshot.get('version')!=1 or not isinstance(snapshot.get('shops'),list) or not isinstance(snapshot.get('listings'),list):raise ValueError('Invalid snapshot')
        now=time.time()*1000;proofs=[]
        for p in pending.glob('*.json'):
            try:
                if p.stat().st_size>2*1024*1024:continue
                data=json.loads(p.read_text());k=validate(data,now)
                if p.stem!=hashlib.sha256(k.encode()).hexdigest():continue
                proofs.append(data)
            except (OSError,ValueError,KeyError,TypeError):
                if p.stat().st_mtime<time.time()-86400:p.unlink(missing_ok=True)
        merged=merge(snapshot,proofs,now)
        content=json.dumps(merged,ensure_ascii=False,separators=(',',':')).encode()
        changed=content!=before
        if changed:
            tmp=output.with_name(output.name+'.stock-next')
            with tmp.open('wb') as f:f.write(content);f.flush();os.fsync(f.fileno())
            tmp.chmod(0o644);os.replace(tmp,output)
        return changed

if __name__=='__main__':
    import sys
    parser=argparse.ArgumentParser();parser.add_argument('--stdin',action='store_true');parser.add_argument('--output',type=Path,default=Path('/var/www/lastlife-hub/daggerfall/vendors.json'));parser.add_argument('--pending',type=Path,default=Path('/home/ryan/dfotimer-owners/private/public-stock-pending'));args=parser.parse_args()
    incoming=json.load(sys.stdin) if args.stdin else None
    print(json.dumps({'inventoryChanged':write(args.output,args.pending,incoming)}))
