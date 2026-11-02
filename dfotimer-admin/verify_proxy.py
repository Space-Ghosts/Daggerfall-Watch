"""Exercise real Caddy -> collector integration with an isolated temporary database."""
import http.client
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from route import route
from server import Store, BoundedServer, collector_handler, PUBLIC_PATH, ORIGIN

with tempfile.TemporaryDirectory() as temp:
    store = Store(Path(temp)/'private')
    collector = BoundedServer(('127.0.0.1',0),collector_handler(store))
    threading.Thread(target=collector.serve_forever,daemon=True).start()
    r = route(store.proxy_key)
    r['handle'][1]['upstreams'][0]['dial'] = f'127.0.0.1:{collector.server_port}'
    config = {'admin':{'disabled':True},'apps':{'http':{'servers':{'test':{'listen':['127.0.0.1:18803'],
             'automatic_https':{'disable':True},'routes':[r,{'handle':[{'handler':'static_response','status_code':404}]}]}}}}}
    filename = Path(temp)/'caddy.json'
    filename.write_text(json.dumps(config))
    with (Path(temp)/'log').open('w') as log:
        proc = subprocess.Popen(['caddy','run','--config',str(filename)],stdout=log,stderr=log)
        def request(path, method='GET', body=None, **headers):
            conn = http.client.HTTPConnection('127.0.0.1',18803,timeout=3)
            try:
                conn.request(method,path,body,{'Host':'relay.spaceghosts.com',**headers})
                response=conn.getresponse()
                response.read()
                return response.status
            finally:
                conn.close()
        try:
            for _ in range(30):
                if proc.poll() is not None:
                    raise RuntimeError('Loopback Caddy failed to start')
                try:
                    request('/')
                    break
                except OSError:
                    time.sleep(.1)
            assert request('/api/stats')==404
            assert request('/daggerfall/admin/')==404
            payload=json.dumps({'view':'vendors'})
            assert request(PUBLIC_PATH,'POST',payload,Origin=ORIGIN,**{'Content-Type':'application/json','User-Agent':'ExampleBrowser','X-Dfo-Client-IP':'198.51.100.1','X-Dfo-Proxy-Key':'attacker'})==204
            assert store.summary()['today']['visitors']==1
            with store.connect() as db:
                visitor=db.execute('SELECT visitor FROM visits').fetchone()[0]
            assert visitor==store.digest(time.strftime('%Y-%m-%d',time.gmtime()),'127.0.0.1','ExampleBrowser')
            assert request(PUBLIC_PATH,'POST',payload,Origin='https://evil.example',**{'Content-Type':'application/json'})==403
            print('PASS: real Caddy proxy, exact route only, trusted IP overwrite, key overwrite, cross-origin rejection, private admin remains unreachable. No production metrics written.')
        finally:
            proc.terminate()
            proc.wait(timeout=5)
            collector.shutdown()
            collector.server_close()
