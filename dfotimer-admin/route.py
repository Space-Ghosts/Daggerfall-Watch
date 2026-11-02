"""Manage only the DFO collection route through Caddy's local admin API.

Idempotent reconciliation handles Caddyfile reloads without editing root-owned files.
No admin dashboard route is ever installed. Configuration bodies are never logged.
"""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
from server import Store, PUBLIC_PATH

IDENTITY = 'dfo-metrics-collector-v1'
API = 'http://127.0.0.1:2019'

def route(key):
    return {'@id': IDENTITY, 'match': [{'host': ['relay.spaceghosts.com'], 'path': [PUBLIC_PATH]}],
            'handle': [{'handler': 'request_body', 'max_size': 128},
                       {'handler': 'reverse_proxy', 'upstreams': [{'dial': '127.0.0.1:18801'}],
                        'headers': {'request': {'set': {'X-Dfo-Proxy-Key': [key],
                                                       'X-Dfo-Client-IP': ['{http.request.remote.host}']},
                                                'delete': ['Cookie', 'Authorization']}},
                        'transport': {'protocol': 'http', 'dial_timeout': 2000000000,
                                      'response_header_timeout': 6000000000}}],
            'terminal': True}

def reconcile(remove=False):
    import fcntl
    private = Path(__file__).parent / 'private'
    private.mkdir(mode=0o700, exist_ok=True)
    with (private/'route.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return reconcile_locked(remove)

def reconcile_locked(remove=False):
    store = Store(Path(__file__).parent / 'private')
    desired = route(store.proxy_key)
    # GET only server metadata; never print private configuration or authentication.
    with urllib.request.urlopen(API+'/config/apps/http/servers', timeout=5) as response:
        servers = json.load(response)
    candidates = [name for name, server in servers.items() if ':443' in server.get('listen', [])]
    if len(candidates) != 1:
        raise RuntimeError('Expected one HTTPS server; manual route review required')
    path = '/config/apps/http/servers/'+candidates[0]+'/routes'
    for _ in range(3):
        with urllib.request.urlopen(API+path, timeout=5) as response:
            current, etag = json.load(response), response.headers.get('Etag')
        managed = [r for r in current if r.get('@id') == IDENTITY]
        if remove and not managed:
            return False
        if not remove and managed == [desired]:
            return False
        if not etag:
            # Caddy 2.6 lacks ETags. Use a single atomic insert, never replace the
            # route array. Deletion addresses only our unique ID. Our lock prevents
            # duplicate installs by simultaneous instances of this reconciler.
            if managed and managed != [desired]:
                raise RuntimeError('Managed route differs; manual review required')
            target = '/id/'+IDENTITY if remove else path+'/0'
            request = urllib.request.Request(API+target, method='DELETE' if remove else 'PUT',
                data=None if remove else json.dumps(desired).encode(), headers={'Content-Type':'application/json'})
            with urllib.request.urlopen(request, timeout=15) as response:
                response.read()
            print('DFO collection route '+('removed.' if remove else 'installed atomically; existing routes preserved.'))
            return True
        unrelated = [r for r in current if r.get('@id') != IDENTITY]
        updated = unrelated if remove else [desired]+unrelated
        request = urllib.request.Request(API+path, data=json.dumps(updated).encode(), method='PATCH',
                                         headers={'Content-Type': 'application/json', 'If-Match': etag})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                response.read()
            print('DFO collection route '+('removed.' if remove else 'installed; private dashboard is not routed.'))
            return True
        except urllib.error.HTTPError as e:
            if e.code != 412:
                raise RuntimeError('Caddy rejected the scoped route update') from None
    raise RuntimeError('Configuration changed concurrently; retry later')

if __name__ == '__main__':
    os.umask(0o077)
    try:
        reconcile('--remove' in sys.argv)
    except Exception:
        print('DFO metrics route reconciliation failed; existing routes were not intentionally changed.', file=sys.stderr)
        sys.exit(1)
