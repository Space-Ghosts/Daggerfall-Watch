"""Run on Homesec: inspect the public tree without printing private values."""
import hashlib
import json
import pathlib

root = pathlib.Path('/var/www/lastlife-hub/daggerfall')
session = json.loads(pathlib.Path('/home/ryan/dfotimer-observer/private/session.json').read_text())
secrets = [value.encode() for key, value in session.items()
           if ('secret' in key.lower() or 'token' in key.lower() or key in ('sessionId', 'peerId'))
           and isinstance(value, str) and len(value) >= 8]
files = [p for p in root.rglob('*') if p.is_file()]
matches = [str(p.relative_to(root)) for p in files if any(value in p.read_bytes() for value in secrets)]
print(json.dumps({'checkedFiles': len(files), 'checkedCredentialValues': len(secrets),
                  'credentialMatchesInPublicFiles': matches,
                  'symlinks': [str(p.relative_to(root)) for p in root.rglob('*') if p.is_symlink()]}))
for name in ['live.json', 'vendors.json']:
    data = json.loads((root / name).read_text())
    forbidden = {'secret', 'token', 'password', 'session', 'sessionId', 'peerSecret',
                 'receipt', 'signature', 'patrons', 'sigil', 'uid'}
    def find_keys(obj):
        if isinstance(obj, dict):
            return (set(obj) & forbidden) | set().union(set(), *(find_keys(v) for v in obj.values()))
        if isinstance(obj, list):
            return set().union(set(), *(find_keys(v) for v in obj))
        return set()
    print(json.dumps({'file': name, 'unexpectedPrivateKeys': sorted(find_keys(data))}))
for name in ['index.html', 'app.js', 'vendors.js', 'vendor-search.js', 'vendor-sets.js']:
    print(json.dumps({'file': name, 'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()}))
