import http.client
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from server import Store, BoundedServer, collector_handler, admin_handler, PUBLIC_PATH, ORIGIN
from route import route

class MetricsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name)/'private')
        self.servers = []
        self.now = 1792886400

    def tearDown(self):
        for server in self.servers:
            server.shutdown()
            server.server_close()
        self.temp.cleanup()

    def http(self, handler):
        server = BoundedServer(('127.0.0.1', 0), handler)
        self.servers.append(server)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server.server_port

    def request(self, port, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=2)
        try:
            conn.request(method, path, body, headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def headers(self, **extra):
        return {'Origin': ORIGIN, 'X-Dfo-Proxy-Key': self.store.proxy_key,
                'X-Dfo-Client-IP': '198.51.100.42', 'User-Agent': 'ExampleBrowser/123',
                'Content-Type': 'application/json', **extra}

    def test_daily_uniques_views_and_rotating_identifiers(self):
        self.store.record('198.51.100.42', 'Browser', 'events', self.now)
        self.store.record('198.51.100.42', 'Browser', 'vendors', self.now+3)
        self.store.record('198.51.100.42', 'Browser', 'vendors', self.now+3)
        s = self.store.summary(self.now+5)
        self.assertEqual((s['today']['visitors'], s['today']['views']), (1, 2))
        self.store.record('198.51.100.43', 'Browser', 'vendors', self.now+6)
        self.assertEqual(self.store.summary(self.now+7)['today']['visitors'], 2)
        self.assertNotEqual(self.store.digest('2026-10-24', '198.51.100.42', 'Browser'), self.store.digest('2026-10-25', '198.51.100.42', 'Browser'))

    def test_retention_and_no_raw_identifiers(self):
        self.store.record('198.51.100.42', 'PrivateUserAgentValue', 'events', self.now)
        with self.store.connect() as db:
            records = repr(db.execute('SELECT * FROM visits').fetchall())
        self.assertNotIn('198.51.100.42', records)
        self.assertNotIn('PrivateUserAgentValue', records)
        s = self.store.summary(self.now+31*86400)
        self.assertFalse(any(d['views'] for d in s['days']))

    def test_rate_limit_is_by_address_not_spoofed_user_agent(self):
        for n in range(60):
            self.assertTrue(self.store.record('198.51.100.42', f'Browser{n}', 'events', self.now))
        self.assertFalse(self.store.record('198.51.100.42', 'Another', 'events', self.now))
        self.assertTrue(self.store.record('198.51.100.42', 'Another', 'events', self.now+60))

    def test_collector_requires_proxy_origin_and_bounded_schema(self):
        port = self.http(collector_handler(self.store))
        payload = json.dumps({'view':'events'})
        self.assertEqual(self.request(port,'POST',PUBLIC_PATH,payload,{'Content-Type':'application/json'})[0],403)
        self.assertEqual(self.request(port,'POST',PUBLIC_PATH,payload,self.headers(Origin='https://evil.example'))[0],403)
        self.assertEqual(self.request(port,'POST',PUBLIC_PATH,payload,self.headers(**{'Sec-Fetch-Site':'cross-site'}))[0],403)
        self.assertEqual(self.request(port,'POST',PUBLIC_PATH,'x'*129,self.headers())[0],413)
        self.assertEqual(self.request(port,'POST',PUBLIC_PATH,json.dumps({'view':'events','search':'SECRET'}),self.headers())[0],400)
        self.assertEqual(self.request(port,'POST',PUBLIC_PATH,json.dumps({'view':'<script>'}),self.headers())[0],400)
        self.assertEqual(self.request(port,'POST',PUBLIC_PATH,payload,self.headers())[0],204)
        self.assertEqual(self.request(port,'GET','/api/stats')[0],404)
        self.assertEqual(self.request(port,'GET','/')[0],404)

    def test_privacy_signals_and_bots_are_not_counted(self):
        port = self.http(collector_handler(self.store))
        payload = json.dumps({'view':'vendors'})
        for extra in ({'DNT':'1'}, {'Sec-GPC':'1'}, {'User-Agent':'ExampleBot'}):
            self.assertEqual(self.request(port,'POST',PUBLIC_PATH,payload,self.headers(**extra))[0],204)
        self.assertEqual(self.store.summary()['today']['views'],0)

    def test_admin_rebinding_cross_site_and_file_denial(self):
        port = self.http(admin_handler(self.store, Path(self.temp.name)))
        self.assertEqual(self.request(port,'GET','/api/stats',headers={'Host':'evil.example'})[0],403)
        self.assertEqual(self.request(port,'GET','/api/stats',headers={'Sec-Fetch-Site':'cross-site'})[0],403)
        self.assertEqual(self.request(port,'GET','/api/stats',headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request(port,'POST','/api/stats','{}')[0],405)
        self.assertEqual(self.request(port,'GET','/private/key')[0],404)
        self.assertEqual(self.request(port,'GET','/../server.py')[0],404)
        status,headers,body = self.request(port,'GET','/api/stats')
        self.assertEqual(status,200)
        self.assertEqual(headers['Cache-Control'],'no-store')
        self.assertIn("frame-ancestors 'none'",headers['Content-Security-Policy'])
        self.assertNotIn('Access-Control-Allow-Origin',headers)
        self.assertNotIn(self.store.proxy_key,body.decode())
        self.assertEqual(json.loads(body)['today']['views'],0)

    def test_public_route_cannot_reach_admin_or_trust_client_ip_headers(self):
        r = route('test-key')
        self.assertEqual(r['match'],[{'host':['relay.spaceghosts.com'],'path':[PUBLIC_PATH]}])
        proxy = r['handle'][1]
        self.assertEqual(proxy['upstreams'],[{'dial':'127.0.0.1:18801'}])
        self.assertEqual(proxy['headers']['request']['set']['X-Dfo-Client-IP'],['{http.request.remote.host}'])
        self.assertEqual(proxy['headers']['request']['delete'],['Cookie','Authorization'])

if __name__ == '__main__':
    unittest.main(verbosity=2)
