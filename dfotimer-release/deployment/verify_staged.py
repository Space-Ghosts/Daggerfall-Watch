"""Exercise the staged static virtual host on loopback without touching live Caddy."""
import json
import pathlib
import subprocess
import time
import urllib.request
import urllib.error

stage = pathlib.Path('/home/ryan/dfotimer-release')
text = (stage / 'deployment/dfotimer.caddy').read_text()
text = text.replace('dfotimer.spaceghosts.com {', 'http://127.0.0.1:8899 {')
text = text.replace('/var/www/dfotimer', str(stage / 'dist'))
preview = stage / 'deployment/verify.caddy'
preview.write_text('{\n admin off\n auto_https off\n}\n' + text)

def request(path, method='GET'):
    try:
        with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8899' + path, method=method), timeout=5) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()

with (stage / 'deployment/verify.log').open('w') as log:
    proc = subprocess.Popen(['caddy', 'run', '--config', str(preview), '--adapter', 'caddyfile'], stdout=log, stderr=log)
    try:
        for _ in range(30):
            if proc.poll() is not None:
                raise RuntimeError('Verification server failed to start; see verify.log')
            try:
                response = request('/')
                break
            except urllib.error.URLError:
                time.sleep(0.1)
        else:
            raise RuntimeError('Verification server did not become ready')
        status, headers, body = response
        assert status == 200
        assert headers.get('X-Content-Type-Options') == 'nosniff'
        assert headers.get('X-Frame-Options') == 'DENY'
        assert headers.get('Referrer-Policy') == 'no-referrer'
        assert headers.get('Strict-Transport-Security') == 'max-age=31536000'
        assert "frame-ancestors 'none'" in headers.get('Content-Security-Policy', '')
        assert "script-src 'self'" in headers.get('Content-Security-Policy', '')
        assert 'unsafe-inline' not in headers.get('Content-Security-Policy', '')
        assert headers.get('Server') is None
        assert b'BACK TO RELAY' not in body and b'href="/"' not in body
        for path in ['/.env', '/.git/config', '/api/status', '/auth/login', '/hex/chat', '/research/events-verified.json', '/deployment/install.sh', '/assets/', '/%2e%2e/etc/passwd']:
            assert request(path)[0] in (400, 404), path
        assert request('/', 'POST')[0] == 405
        for path in ['/app.js', '/timers.js']:
            status, h, _ = request(path)
            assert status == 200 and 'javascript' in h.get('Content-Type', ''), path
        status, _, body = request('/events.json')
        assert status == 200 and len(json.loads(body)['events']) == 8
        print('PASS: content, JS MIME types, eight dossiers, CSP, security headers, method restriction, private paths, no directory listing, no Relay links.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)
