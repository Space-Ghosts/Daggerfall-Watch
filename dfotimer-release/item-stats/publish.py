"""Generate public, static shop documents and Discord cards from public snapshots.

No inbound service, credentials, game requests, or user-provided paths. Run after
scans via a user timer. HTML and image are replaced atomically; old shops retain
an unavailable page, never obsolete stock. Private state stays outside webroot.
"""
import argparse
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import time
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ORIGIN = 'https://dfo.spaceghosts.com/'
VERSION = 'stats-20261027-1'
RANK = {'gilded':0,'aetheric':1,'artifact':2,'legendary':3,'rare':4,'magic':5,'common':6}
COLORS = ['#82958b','#739fca','#69b283','#c9aa78']

def identity(shop):
    mid, vid = shop.get('map'), shop.get('vendorId')
    if type(mid) is not int or not 0 < mid <= 0xffffffff or not isinstance(vid,str) or not 0 < len(vid) <= 128 or re.search(r'[\x00-\x1f\x7f]',vid):
        raise ValueError('Invalid public shop identity')
    return f'{mid}/{vid.encode("utf-8").hex()}'

def public_shop(shop):
    identity(shop)
    out={k:shop.get(k) for k in ['map','vendorId','buildingKey','checkedAt']}
    for k in ['seller','town','region']:
        value=shop.get(k,'')
        out[k]=re.sub(r'[\x00-\x1f\x7f]','',value)[:160] if isinstance(value,str) else ''
    out['status']=shop.get('status','available') if shop.get('status','available') in ['available','unavailable','not-listed'] else 'unavailable'
    return out

def stamp(ms):
    return datetime.fromtimestamp(ms/1000,timezone.utc).strftime('%d %b %Y, %H:%M UTC') if isinstance(ms,(int,float)) and 0 < ms < 1e14 else 'Not available'

def atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    # umask is private; explicitly grant only the static output directories.
    for directory in [path.parent,path.parent.parent]: directory.chmod(0o755)
    if path.is_symlink(): raise ValueError('Refuse symlink output')
    temp=path.with_name(path.name+'.next')
    with temp.open('xb') as f:f.write(data)
    temp.chmod(0o644);os.replace(temp,path)

def font(size,bold=False,serif=False):
    names = ['DejaVuSerif.ttf'] if serif else ['DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf']
    candidates=[Path('/usr/share/fonts/truetype/dejavu')/names[0],Path('C:/Windows/Fonts')/('georgia.ttf' if serif else 'arialbd.ttf' if bold else 'arial.ttf')]
    for path in candidates:
        if path.is_file():return ImageFont.truetype(str(path),size)
    return ImageFont.load_default(size=size)

def fit(draw,text,f,max_width):
    value=str(text)
    if draw.textlength(value,font=f)<=max_width:return value
    while value and draw.textlength(value+'…',font=f)>max_width:value=value[:-1]
    return value+'…'

def load_map(root,shop,cache):
    mid=shop['map']
    if mid not in cache:
        path=root/'maps'/f'{mid}.json'
        if not path.is_file() or path.stat().st_size>2*1024*1024:
            cache[mid]=None
        else:
            data=json.loads(path.read_text(encoding='utf-8'))
            w,h=data.get('width'),data.get('height')
            if data.get('version')!=2 or data.get('map')!=mid or type(w) is not int or type(h) is not int or not 0<w<=1024 or not 0<h<=1024:
                raise ValueError('Invalid map dimensions')
            if len(data.get('rectangles',[]))>100000 or len(data.get('buildings',[]))>5000:raise ValueError('Oversized map')
            for r in data.get('rectangles',[]):
                if len(r)!=5 or not all(type(v) is int for v in r):raise ValueError('Invalid map rectangle')
                x,y,rw,rh,kind=r
                if min(x,y)<0 or min(rw,rh)<=0 or x+rw>w or y+rh>h or not 0<=kind<=3:raise ValueError('Out of bounds map')
            for b in data.get('buildings',[]):
                if not isinstance(b.get('x'),(int,float)) or not isinstance(b.get('y'),(int,float)) or not 0<=b['x']<=w or not 0<=b['y']<=h:raise ValueError('Invalid map anchor')
            cache[mid]=data
    return cache[mid]

def card(shop,rows,map_data,stale):
    im=Image.new('RGB',(1200,630),'#0a1215');d=ImageDraw.Draw(im)
    d.rectangle((16,16,1183,613),outline='#476451',width=2)
    d.text((38,34),'DAGGERFALL WATCH  /  PLAYER SHOP',font=font(17,True),fill='#9cf7bd')
    d.text((38,75),fit(d,(shop['seller'] or 'Unnamed seller')+'’s shop',font(42,serif=True),1100),font=font(42,serif=True),fill='#f0dca8')
    d.text((40,134),fit(d,f"{shop['town']} · {shop['region']}",font(23),1100),font=font(23),fill='#72d3d6')
    status=shop['status']
    summary=f'{len(rows):,} listings · {sum(r["quantity"] for r in rows):,} items'
    if status!='available':summary='Stock unavailable · check the shop page'
    elif stale:summary='Older snapshot · '+summary
    d.text((40,179),summary,font=font(19,True),fill='#dfbd75')
    d.line((40,216,1160,216),fill='#31473e',width=1)
    d.text((40,239),'FEATURED STOCK' if rows else 'SHOP STATUS',font=font(16,True),fill='#9cf7bd')
    if not rows:
        message='No active listings in the latest snapshot.' if status=='available' else 'No verified stock in the latest scan.'
        d.text((40,286),message,font=font(18),fill='#b4c3bb')
    for i,row in enumerate(rows[:3]):
        y=278+i*88
        color='#f0dca8' if row.get('rarity')=='gilded' else '#e5e9dc'
        d.text((40,y),fit(d,row['name'],font(23,True),560),font=font(23,True),fill=color)
        detail=f"{row.get('rarity','common').upper()} · {row['price']:,} {row['currency']} · Qty {row['quantity']}"
        d.text((40,y+33),fit(d,detail,font(16),560),font=font(16),fill='#96aaa1')
    box=(650,238,1155,548);d.rectangle(box,fill='#11231f',outline='#3d594d')
    if map_data:
        w,h=map_data['width'],map_data['height'];scale=min(465/w,270/h);ox=902.5-w*scale/2;oy=393-h*scale/2
        for x,y,rw,rh,kind in map_data['rectangles']:
            d.rectangle((ox+x*scale,oy+y*scale,ox+(x+rw)*scale,oy+(y+rh)*scale),fill=COLORS[kind])
        anchor=next((b for b in map_data['buildings'] if b['key']==shop.get('buildingKey')),None)
        if anchor:
            x,y=ox+anchor['x']*scale,oy+anchor['y']*scale
            d.ellipse((x-11,y-11,x+11,y+11),fill='#0a1215',outline='#ffdd78',width=3)
            d.ellipse((x-4,y-4,x+4,y+4),fill='#ffdd78')
        d.rectangle((659,244,848,268),fill='#0a1215')
        d.text((668,247),'N ↑  ·  GOLD = HOUSE' if anchor else 'N ↑  ·  TOWN MAP',font=font(13,True),fill='#ffdd78')
    else:
        d.text((677,350),'Map not yet available',font=font(22),fill='#dfbd75')
        d.text((677,388),'Use Set waypoint in game',font=font(17),fill='#96aaa1')
    d.line((40,566,1160,566),fill='#31473e')
    d.text((40,584),'Checked '+stamp(shop.get('checkedAt')),font=font(15),fill='#96aaa1')
    d.text((795,584),'Snapshot only · Stock may sell',font=font(15),fill='#96aaa1')
    result=io.BytesIO();im.save(result,format='PNG',optimize=True);return result.getvalue()

def document(shop,rows,revision,stale):
    esc=lambda value:html.escape(str(value),quote=True)
    path='shops/'+identity(shop)+'/'
    title=(shop['seller'] or 'Unnamed seller')+'’s shop'
    description=f"{shop['town']} · {shop['region']}. {len(rows):,} listings. Checked {stamp(shop.get('checkedAt'))}. Stock may sell between scans."
    if shop['status']!='available':description=f"{shop['town']} · {shop['region']}. Stock is unavailable in the latest scan."
    if stale:description='Older inventory snapshot. '+description
    cells=[]
    for row in rows:
        cells.append('<tr><td>'+esc(row['name'])+'</td><td>'+esc(f"{row['price']:,} {row['currency']}")+'</td><td>'+esc(row['quantity'])+'</td></tr>')
    values={'TITLE':esc(title),'DESCRIPTION':esc(description),'URL':esc(ORIGIN+path),'IMAGE':esc(ORIGIN+path+'preview.png?v='+revision),
        'MAP':str(shop['map']),'VENDOR':esc(shop['vendorId']),'SELLER':esc(shop['seller']),'TOWN':esc(shop['town']),'REGION':esc(shop['region']),
        'CHECKED':esc(stamp(shop.get('checkedAt'))),'COUNT':str(len(rows)),'ROWS':''.join(cells),'REVISION':revision}
    output=(HERE/'template.html').read_text(encoding='utf-8')
    for key,value in values.items():output=output.replace('@@'+key+'@@',value)
    return output.encode('utf-8')

def build(root,state):
    root=root.resolve();state=state.resolve();state.mkdir(parents=True,exist_ok=True)
    raw=(root/'vendors.json').read_bytes()
    if len(raw)>32*1024*1024:raise ValueError('Snapshot too large')
    snapshot=json.loads(raw)
    if snapshot.get('version')!=1 or not isinstance(snapshot.get('listings'),list) or not isinstance(snapshot.get('updatedAt'),(int,float)):raise ValueError('Invalid snapshot')
    now=time.time()*1000;groups={};shops={};cache={}
    for row in snapshot['listings']:
        key=identity(row);shops.setdefault(key,public_shop(row))
        if row.get('expiresAt',0)>now and type(row.get('quantity')) is int and row['quantity']>0 and type(row.get('price')) is int and row['price']>=0:
            groups.setdefault(key,[]).append(row)
    if isinstance(snapshot.get('shops'),list):shops={identity(s):public_shop(s) for s in snapshot['shops']}
    old=json.loads((state/'catalog.json').read_text(encoding='utf-8')) if (state/'catalog.json').is_file() else {}
    # Missing shops keep a working address with no previous stock.
    for key,previous in old.items():
        if key not in shops:
            shop=public_shop(previous['shop']);shop['status']='not-listed';shop['checkedAt']=None;shops[key]=shop
    (root/'shops').mkdir(exist_ok=True);(root/'shops').chmod(0o755)
    catalog={};changed=0;map_missing=0
    for key,shop in shops.items():
        rows=groups.get(key,[]) if shop['status']=='available' else []
        rows=sorted(rows,key=lambda row:(RANK.get(row.get('rarity'),99),row.get('name',''),row.get('id','')))
        map_data=load_map(root,shop,cache);map_missing+=map_data is None
        stale=now-(shop.get('checkedAt') or snapshot['updatedAt'])>2*60*60*1000
        digest=hashlib.sha256(json.dumps([VERSION,shop,rows,map_data,stale],ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:20]
        target=root/'shops'/key
        if old.get(key,{}).get('revision')!=digest or not (target/'index.html').is_file() or not (target/'preview.png').is_file():
            atomic(target/'preview.png',card(shop,rows,map_data,stale))
            atomic(target/'index.html',document(shop,rows,digest,stale));changed+=1
        catalog[key]={'shop':shop,'revision':digest}
    pending=state/'catalog.next';pending.write_text(json.dumps(catalog),encoding='utf-8');pending.chmod(0o600);os.replace(pending,state/'catalog.json')
    print(json.dumps({'shops':len(shops),'changed':changed,'missingMaps':map_missing,'snapshotUpdatedAt':snapshot['updatedAt']}))

if __name__=='__main__':
    import contextlib
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--state',type=Path,required=True)
    args=parser.parse_args();os.umask(0o077);args.state.mkdir(parents=True,exist_ok=True)
    with (args.state/'build.lock').open('w') as lock:
        if os.name!='nt':
            import fcntl
            fcntl.flock(lock,fcntl.LOCK_EX)
        build(args.root,args.state)
