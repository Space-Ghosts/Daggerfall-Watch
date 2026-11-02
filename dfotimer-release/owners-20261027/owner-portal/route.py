"""Reconcile only the public owner-portal route; never log Caddy's configuration."""
import fcntl,json,os,urllib.request
from pathlib import Path
BASE=Path(__file__).resolve().parent
IDENTITY='dfo-owner-portal-v1'
API='http://127.0.0.1:2019'
def call(path,method='GET',data=None):
    request=urllib.request.Request(API+path,method=method,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=15) as r:
        raw=r.read();return json.loads(raw) if raw else None
def desired():
    key=(BASE/'private/proxy-key').read_text().strip()
    return {'@id':IDENTITY,'match':[{'host':['dfo.spaceghosts.com'],'path':['/owner/*']}],
        'handle':[{'handler':'request_body','max_size':6*1024*1024},
        {'handler':'reverse_proxy','upstreams':[{'dial':'127.0.0.1:18803'}],
         'headers':{'request':{'set':{'Host':['dfo.spaceghosts.com'],'X-Dfo-Proxy-Key':[key],'X-Dfo-Client-IP':['{http.request.remote.host}'],'X-Forwarded-Proto':['https']},'delete':['Authorization','Forwarded']}},
         'transport':{'protocol':'http','dial_timeout':2000000000,'response_header_timeout':30000000000}}], 'terminal':True}
def reconcile(remove=False):
    servers=call('/config/apps/http/servers')
    names=[n for n,s in servers.items() if ':443' in s.get('listen',[])]
    if len(names)!=1:raise RuntimeError('Expected one HTTPS server')
    path='/config/apps/http/servers/'+names[0]+'/routes';routes=call(path)
    old=[r for r in routes if r.get('@id')==IDENTITY];target=desired()
    if remove:
        if old:call('/id/'+IDENTITY,'DELETE')
        return
    if old and old!=[target]:raise RuntimeError('Managed owner route differs; review required')
    if old==[target] and routes[0]==target:return
    # A Caddyfile reload can restore the static host before this route. Move only
    # our own exact route ahead of it; unrelated routes remain untouched.
    if old:call('/id/'+IDENTITY,'DELETE')
    call(path+'/0','PUT',target)
    print('Owner portal route ready.')
if __name__=='__main__':
    import sys
    os.umask(0o077)
    with (BASE/'private/route.lock').open('w') as f:
        fcntl.flock(f,fcntl.LOCK_EX);reconcile('--remove' in sys.argv)
