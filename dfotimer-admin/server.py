"""Private, SSH-only dashboard and a separate bounded write-only metrics collector."""
import datetime as dt
from contextlib import contextmanager
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = Path(__file__).resolve().parent
UTC = dt.timezone.utc
PUBLIC_PATH = '/daggerfall/metrics/collect'
ORIGIN = 'https://relay.spaceghosts.com'
CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

def day_at(now):
    return dt.datetime.fromtimestamp(now, UTC).date().isoformat()

class Store:
    def __init__(self, directory):
        directory = Path(directory)
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        directory.chmod(0o700)
        self.path = directory / 'metrics.sqlite3'
        keyfile = directory / 'key'
        if not keyfile.exists():
            with keyfile.open('xb') as f:
                f.write(secrets.token_bytes(32))
        keyfile.chmod(0o600)
        self.key = keyfile.read_bytes()
        self.proxy_key = hmac.new(self.key, b'proxy-auth', hashlib.sha256).hexdigest()
        self.lock = threading.Lock()
        self.buckets = {}
        self.minute = -1
        self.total = 0
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS visits (
                    day TEXT NOT NULL, visitor TEXT NOT NULL,
                    first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
                    events INTEGER NOT NULL DEFAULT 0, vendors INTEGER NOT NULL DEFAULT 0,
                    last_event INTEGER NOT NULL DEFAULT 0, last_vendor INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (day, visitor));
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            ''')
            db.execute('INSERT OR IGNORE INTO metadata VALUES (?,?)', ('started', str(int(time.time()))))
            self.prune(db, int(time.time()))
        self.path.chmod(0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=3)
        try:
            with db:
                yield db
        finally:
            db.close()

    def digest(self, day, ip, ua=''):
        # Daily scopes cannot be joined across days without the private key.
        return hmac.new(self.key, f'{day}\0{ip}\0{ua}'.encode(), hashlib.sha256).hexdigest()

    def prune(self, db, now):
        cutoff = (dt.datetime.fromtimestamp(now, UTC).date() - dt.timedelta(days=29)).isoformat()
        db.execute('DELETE FROM visits WHERE day < ?', (cutoff,))

    def record(self, ip, ua, view, now=None):
        now = int(time.time() if now is None else now)
        day = day_at(now)
        # Retain no raw IP or user-agent, even in the in-memory rate limiter.
        visitor = self.digest(day, ip, ua[:256])
        address = self.digest(day, ip)
        with self.lock:
            minute = now // 60
            if minute != self.minute:
                self.minute, self.total, self.buckets = minute, 0, {}
            if self.total >= 1000 or self.buckets.get(address, 0) >= 60:
                return False
            self.total += 1
            self.buckets[address] = self.buckets.get(address, 0) + 1
            with self.connect() as db:
                self.prune(db, now)
                row = db.execute('SELECT last_event,last_vendor FROM visits WHERE day=? AND visitor=?', (day, visitor)).fetchone()
                if row and now - row[0 if view == 'events' else 1] < 2:
                    return True
                if not row and db.execute('SELECT count(*) FROM visits WHERE day=?', (day,)).fetchone()[0] >= 20000:
                    return False
                e, v = int(view == 'events'), int(view == 'vendors')
                db.execute('''INSERT INTO visits VALUES (?,?,?,?,?,?,?,?)
                    ON CONFLICT(day,visitor) DO UPDATE SET
                    last_seen=excluded.last_seen, events=visits.events+excluded.events,
                    vendors=visits.vendors+excluded.vendors,
                    last_event=MAX(visits.last_event,excluded.last_event),
                    last_vendor=MAX(visits.last_vendor,excluded.last_vendor)''',
                    (day, visitor, now, now, e, v, now if e else 0, now if v else 0))
        return True

    def summary(self, now=None):
        now = int(time.time() if now is None else now)
        with self.lock, self.connect() as db:
            self.prune(db, now)
            rows = db.execute('SELECT day,count(*),SUM(events),SUM(vendors) FROM visits GROUP BY day ORDER BY day').fetchall()
            active = db.execute('SELECT count(*) FROM visits WHERE last_seen>=?', (now-300,)).fetchone()[0]
            started = int(db.execute('SELECT value FROM metadata WHERE key=?', ('started',)).fetchone()[0])
        days = {row[0]: {'date': row[0], 'visitors': row[1], 'events': row[2], 'vendors': row[3], 'views': row[2]+row[3]} for row in rows}
        today = dt.datetime.fromtimestamp(now, UTC).date()
        series = []
        for n in range(29, -1, -1):
            date = (today-dt.timedelta(days=n)).isoformat()
            series.append(days.get(date, {'date': date, 'visitors': 0, 'events': 0, 'vendors': 0, 'views': 0}))
        return {'updatedAt': now, 'startedAt': started, 'recentVisitors': active,
                'days': series, 'today': series[-1], 'views7days': sum(d['views'] for d in series[-7:])}

def health(root):
    result = {}
    for filename in ('live.json', 'vendors.json'):
        try:
            data = json.loads((root / filename).read_text())
            if filename == 'live.json':
                result['observer'] = {k: data.get(k) for k in ('connected', 'updatedAt', 'lastMessageAt')}
            else:
                c = data.get('coverage', {})
                result['vendors'] = {'updatedAt': data.get('updatedAt'), 'listings': len(data.get('listings', [])),
                                     'checked': c.get('vendorsChecked'), 'total': c.get('vendorsDiscovered'), 'complete': c.get('complete')}
        except (OSError, ValueError, TypeError):
            result['observer' if filename == 'live.json' else 'vendors'] = None
    return result

class BoundedServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16
    def __init__(self, address, handler):
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(address, handler)
    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise
    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()
    def handle_error(self, request, address):
        # The default implementation prints client addresses and tracebacks.
        print('Metrics request could not be completed.', flush=True)

class Handler(BaseHTTPRequestHandler):
    server_version = 'DFO'
    sys_version = ''
    def setup(self):
        super().setup()
        self.connection.settimeout(5)
    def log_message(self, *_):
        pass  # No access logs, IP addresses, URLs, headers or request bodies.
    def send(self, status, body=b'', mime='text/plain; charset=utf-8'):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)
    def do_GET(self):
        self.send(404)
    def do_POST(self):
        self.send(405)
    def do_HEAD(self):
        self.do_GET()
    def do_OPTIONS(self):
        self.send(405)

def collector_handler(store):
    class Collector(Handler):
        def do_POST(self):
            if self.path != PUBLIC_PATH:
                return self.send(404)
            if not hmac.compare_digest(self.headers.get('X-Dfo-Proxy-Key', ''), store.proxy_key):
                return self.send(403)
            if self.headers.get('Origin') != ORIGIN or self.headers.get('Sec-Fetch-Site', 'same-origin') != 'same-origin':
                return self.send(403)
            if self.headers.get('Transfer-Encoding') or self.headers.get_content_type() != 'application/json':
                return self.send(415)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 128:
                    return self.send(413)
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict) or set(body) != {'view'} or body['view'] not in ('events', 'vendors'):
                    return self.send(400)
                ip = str(ipaddress.ip_address(self.headers.get('X-Dfo-Client-IP', '')))
            except (ValueError, TypeError):
                return self.send(400)
            ua = self.headers.get('User-Agent', '')[:256]
            if self.headers.get('DNT') == '1' or self.headers.get('Sec-GPC') == '1' or any(x in ua.lower() for x in ('bot', 'spider', 'crawler', 'headless', 'curl/', 'python-')):
                return self.send(204)
            try:
                accepted = store.record(ip, ua, body['view'])
            except sqlite3.Error:
                return self.send(503)
            self.send(204 if accepted else 429)
    return Collector

def admin_handler(store, root):
    class Admin(Handler):
        def do_GET(self):
            expected = f'127.0.0.1:{self.server.server_port}'
            if self.headers.get('Host') != expected or self.headers.get('Sec-Fetch-Site') in ('cross-site', 'same-site'):
                return self.send(403)
            if self.headers.get('Origin') not in (None, 'http://' + expected):
                return self.send(403)
            if self.path == '/api/stats':
                try:
                    data = store.summary()
                    data['health'] = health(root)
                    return self.send(200, json.dumps(data).encode(), 'application/json')
                except (sqlite3.Error, OSError):
                    return self.send(503)
            files = {'/': ('index.html', 'text/html; charset=utf-8'),
                     '/admin.js': ('admin.js', 'text/javascript; charset=utf-8'),
                     '/admin.css': ('admin.css', 'text/css; charset=utf-8')}
            if self.path not in files:
                return self.send(404)
            name, mime = files[self.path]
            self.send(200, (HERE/name).read_bytes(), mime)
    return Admin

def main():
    os.umask(0o077)
    store = Store(os.environ.get('DFO_METRICS_DATA', str(HERE / 'private')))
    root = Path(os.environ.get('DFO_PUBLIC_ROOT', '/var/www/lastlife-hub/daggerfall'))
    admin = BoundedServer(('127.0.0.1', 18802), admin_handler(store, root))
    collector = BoundedServer(('127.0.0.1', 18801), collector_handler(store))
    threading.Thread(target=admin.serve_forever, daemon=True).start()
    print('Private dashboard and write-only collector ready on loopback.', flush=True)
    collector.serve_forever()

if __name__ == '__main__':
    main()
