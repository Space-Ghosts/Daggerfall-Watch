"""Exercise the proposed path headers on loopback; leave production untouched."""
import pathlib
import subprocess
import time
import urllib.error
import urllib.request

stage = pathlib.Path('/home/ryan/dfotimer-release/deployment')
config = stage / 'verify-path-security.caddy'
config.write_text('''{
    admin off
    auto_https off
}
http://127.0.0.1:8899 {
    import ''' + str(stage / 'daggerfall-security.caddy') + '''
    root * /var/www/lastlife-hub
    file_server
}
''')

def request(path, method='GET'):
    try:
        with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8899' + path, method=method), timeout=5) as r:
            return r.status, r.headers
    except urllib.error.HTTPError as e:
        e.close()
        return e.code, e.headers

with (stage / 'verify-path-security.log').open('w') as log:
    proc = subprocess.Popen(['caddy', 'run', '--config', str(config), '--adapter', 'caddyfile'], stdout=log, stderr=log)
    try:
        for _ in range(30):
            if proc.poll() is not None:
                raise RuntimeError('Verification server failed to start')
            try:
                status, headers = request('/daggerfall/')
                break
            except urllib.error.URLError:
                time.sleep(.1)
        else:
            raise RuntimeError('Verification server did not become ready')
        assert status == 200
        assert "frame-ancestors 'none'" in headers['Content-Security-Policy']
        assert headers['X-Frame-Options'] == 'DENY'
        assert headers['X-Content-Type-Options'] == 'nosniff'
        assert headers['Referrer-Policy'] == 'no-referrer'
        assert headers['Cache-Control'] == 'no-cache'
        assert request('/daggerfall/', 'POST')[0] == 405
        for name in ['app.js', 'vendors.js', 'live.json', 'vendors.json']:
            assert request('/daggerfall/' + name)[0] == 200
        for name in ['.env', '.git/config', 'private/session.json', 'observer/private/session.json', 'assets/']:
            assert request('/daggerfall/' + name)[0] == 404
        assert request('/outside-dfo-security-check')[1].get('Content-Security-Policy') is None
        print('PASS: scoped CSP, framing denial, MIME/referrer protections, cache policy, method restriction, private paths, live assets; unrelated paths unchanged.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)
