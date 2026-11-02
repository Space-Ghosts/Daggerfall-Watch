"""Own only two named Caddy routes; preserve all other apps and private config.

Run as a user timer to restore these routes after root Caddyfile reloads.
The legacy redirect is present only while the new TLS virtual host is healthy.
"""
import fcntl
import http.client
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import urllib.request

BASE = Path(__file__).resolve().parent
API = 'http://127.0.0.1:2019'
HOST_ID = 'dfo-public-host-v1'
REDIRECT_ID = 'dfo-legacy-redirect-v1'

def api(path, method='GET', value=None):
    req = urllib.request.Request(API + path, method=method,
        data=None if value is None else json.dumps(value).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        body = response.read()
        return json.loads(body) if body else None

def desired_host():
    result = subprocess.run(['caddy', 'adapt', '--config', str(BASE/'dfo-public.caddy'),
                             '--adapter', 'caddyfile'], capture_output=True, check=True)
    servers = json.loads(result.stdout)['apps']['http']['servers']
    routes = [r for server in servers.values() for r in server.get('routes', [])]
    assert len(routes) == 1 and routes[0]['match'] == [{'host': ['dfo.spaceghosts.com']}]
    routes[0]['@id'] = HOST_ID
    return routes[0]

def healthy():
    conn = http.client.HTTPSConnection('dfo.spaceghosts.com', timeout=8)
    try:
        # Avoid LAN hairpin routing, while still validating the public hostname
        # against the normal trust store and using its SNI virtual host.
        conn.sock = ssl.create_default_context().wrap_socket(
            socket.create_connection(('127.0.0.1', 443), timeout=8),
            server_hostname='dfo.spaceghosts.com')
        conn.request('GET', '/')
        response = conn.getresponse()
        return (response.status == 200 and b'Daggerfall Watch' in response.read(65536)
                and response.getheader('X-Frame-Options') == 'DENY')
    except (OSError, ssl.SSLError, http.client.HTTPException):
        return False
    finally:
        conn.close()

def desired_redirect():
    return {'@id': REDIRECT_ID,
        'match': [{'host': ['relay.spaceghosts.com'],
                   'path': ['/daggerfall', '/daggerfall/', '/daggerfall/index.html'],
                   'method': ['GET', 'HEAD'],
                   # Local clients may depend on a hosts-file override for Relay
                   # because this router cannot hairpin to its public address.
                   # Keep their existing URL usable without requiring OS edits.
                   'not': [{'remote_ip': {'ranges': [
                       '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12',
                       '192.168.0.0/16', '100.64.0.0/10', '::1/128',
                       'fc00::/7', 'fe80::/10']}}]}],
        'handle': [{'handler': 'rewrite', 'uri': '/'},
                   {'handler': 'static_response', 'status_code': 307,
                    'headers': {'Location': ['https://dfo.spaceghosts.com{http.request.uri}'],
                                'Cache-Control': ['no-store']}}],
        'terminal': True}

def reconcile():
    servers = api('/config/apps/http/servers')
    names = [name for name, server in servers.items() if ':443' in server.get('listen', [])]
    assert len(names) == 1, 'Expected one HTTPS server'
    path = '/config/apps/http/servers/' + names[0] + '/routes'
    def ensure(route):
        managed = [r for r in api(path) if r.get('@id') == route['@id']]
        if managed == [route]:
            return
        if managed:
            raise RuntimeError('Managed route changed; review before replacing')
        # Caddy 2.6 has no ETags. Insert one route atomically; never replace the
        # whole array or log the existing config (which contains other secrets).
        api(path + '/0', 'PUT', route)
        print('Installed ' + route['@id'])
    ensure(desired_host())
    if not healthy():
        if any(r.get('@id') == REDIRECT_ID for r in api(path)):
            api('/id/' + REDIRECT_ID, 'DELETE')
        print('Waiting for validated HTTPS; old site continues serving normally.')
        return
    ensure(desired_redirect())
    print('New HTTPS site and legacy redirect ready.')

if __name__ == '__main__':
    os.umask(0o077)
    with (BASE/'host-route.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        reconcile()
