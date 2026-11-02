"""Exercise isolated-host route on loopback before changing live Caddy."""
import importlib.util
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

base = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('host_route', base/'host-route.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
host = module.desired_host()
redirect = module.desired_redirect()
# A test-only Host value lets a loopback request exercise the public branch.
# The unmodified production route below separately verifies the LAN fallback.
public_case = json.loads(json.dumps(redirect))
public_case['@id'] = 'test-public-redirect'
public_case['match'][0]['host'] = ['public-case.test']
del public_case['match'][0]['not']
fallback = {'handle': [{'handler': 'static_response', 'body': 'legacy-fallback'}]}
config = {'admin': {'disabled': True}, 'apps': {'http': {'servers': {'preview': {
    'listen': ['127.0.0.1:8899'], 'automatic_https': {'disable': True},
    'routes': [host, redirect, public_case, fallback]}}}}}
(base/'verify-host.json').write_text(json.dumps(config))
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
opener = urllib.request.build_opener(NoRedirect)
def request(path, method='GET', hostname='dfo.spaceghosts.com'):
    req = urllib.request.Request('http://127.0.0.1:8899'+path, method=method,
                                 headers={'Host': hostname})
    try:
        response = opener.open(req, timeout=4)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()
with (base/'verify-host.log').open('w') as log:
    proc = subprocess.Popen(['caddy', 'run', '--config', str(base/'verify-host.json')],
                             stdout=log, stderr=log)
    try:
        for _ in range(40):
            try:
                status, headers, body = request('/')
                break
            except urllib.error.URLError:
                time.sleep(.1)
        assert status == 200 and b'Daggerfall Watch' in body
        assert headers['X-Frame-Options'] == 'DENY'
        assert "frame-ancestors 'none'" in headers['Content-Security-Policy']
        assert headers['X-Content-Type-Options'] == 'nosniff'
        assert headers['Cache-Control'] == 'no-cache'
        assert headers.get('Server') is None
        for name in ['app.js', 'vendors.js', 'vendor-map.js', 'events.json', 'live.json', 'vendors.json']:
            assert request('/'+name)[0] == 200, name
        assert request('/', 'POST')[0] == 405
        for path in ['/.env', '/.git/config', '/private/session.json', '/observer/private/session.json',
                     '/admin/', '/api/status', '/auth/login', '/assets/', '/maps/', '/deployment/install.sh']:
            assert request(path)[0] == 404, path
        for path in ['/daggerfall', '/daggerfall/', '/daggerfall/index.html']:
            status, headers, _ = request(path+'?test=one%20two&x=2', hostname='public-case.test')
            assert status == 307
            assert headers['Location'] == 'https://dfo.spaceghosts.com/?test=one%20two&x=2', headers['Location']
            assert headers['Cache-Control'] == 'no-store'
            assert request(path, hostname='relay.spaceghosts.com')[2] == b'legacy-fallback'
        for path in ['/daggerfall/vendors.json', '/daggerfall/maps/1.json', '/', '/another-app']:
            assert request(path, hostname='public-case.test')[2] == b'legacy-fallback'
        print('PASS: assets, feeds, headers, private paths, methods, no directory browse, all legacy page redirects, query preservation, LAN fallback, unrelated paths untouched.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)
