import json, os, subprocess, time
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand
from django.contrib.sessions.models import Session
from django.utils import timezone
from portal.models import Challenge, ShopProfile, LimitBucket, Audit, UsedProof
from portal.domain import accept_proof, snapshot, identity, ASSET

def export_profiles():
    now=timezone.now();data=snapshot()
    shops={identity(s):s for s in data['shops']}
    output={};keep=set()
    for p in ShopProfile.objects.filter(disabled=False,verified_until__gt=now):
        shop=shops.get(p.key)
        if not shop or shop.get('seller')!=p.seller: continue
        banner=p.banner if ASSET.fullmatch(p.banner or '') and (settings.MEDIA_ROOT/p.banner).is_file() else ''
        gallery=[g for g in p.gallery if isinstance(g,dict) and ASSET.fullmatch(g.get('file','')) and (settings.MEDIA_ROOT/g['file']).is_file()][:4]
        output[p.key]={'seller':p.seller,'banner':banner,'gallery':gallery,'featured':p.featured[:3],'verifiedUntil':int(p.verified_until.timestamp()*1000)}
        if banner: keep.add(banner)
        keep.update(g['file'] for g in gallery)
    export=settings.PRIVATE/'published-profiles.json'
    content=json.dumps(output,ensure_ascii=False,sort_keys=True).encode()
    changed=not export.exists() or export.read_bytes()!=content
    if changed:
        temp=export.with_suffix('.next')
        with temp.open('wb') as f:f.write(content)
        temp.chmod(0o600);os.replace(temp,export)
    # Retain current draft assets, even for temporarily expired ownership; clear
    # replaced uploads after an hour. Publication reads only exported references.
    retained=set(keep)
    for p in ShopProfile.objects.all():
        retained.add(p.banner);retained.update(g.get('file') for g in p.gallery)
    for path in settings.MEDIA_ROOT.iterdir():
        if path.is_file() and not path.is_symlink() and ASSET.fullmatch(path.name) and path.name not in retained and path.stat().st_mtime<time.time()-3600:
            path.unlink()
    return changed

class Command(BaseCommand):
    help='Read pending listing proofs and publish sanitized shop customization.'
    def handle(self,*args,**options):
        import fcntl
        with (settings.PRIVATE/'worker.lock').open('w') as lock:
            try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: return
            now=timezone.now()
            Challenge.objects.filter(state='pending',expires_at__lte=now).update(state='expired',requested_at=None)
            pending=list(Challenge.objects.filter(state='pending',requested_at__isnull=False,expires_at__gt=now).order_by('requested_at')[:5])
            for c in pending:
                try:
                    mid,hexid=c.shop_key.split('/')
                    result=subprocess.run([settings.NODE,settings.GAME_PROBE,mid,hexid],capture_output=True,timeout=65,check=True)
                    if len(result.stdout)>2*1024*1024: raise ValueError('Oversized proof')
                    accept_proof(c.pk,json.loads(result.stdout))
                except (subprocess.SubprocessError,ValueError,OSError):
                    # Never log session information, raw proofs or player messages.
                    self.stderr.write('A queued public-shop verification read was unavailable.')
                Challenge.objects.filter(pk=c.pk).update(requested_at=None,checked_at=timezone.now(),attempts=c.attempts+1)
            changed=export_profiles()
            # A failed publish is retried next run, even if the export is unchanged.
            marker=settings.PRIVATE/'published-export.sha256'
            import hashlib
            digest=hashlib.sha256((settings.PRIVATE/'published-profiles.json').read_bytes()).hexdigest()
            if not marker.exists() or marker.read_text()!=digest:
                subprocess.run(['systemctl','--user','start','dfotimer-shops.service'],check=True,timeout=180)
                marker.write_text(digest);marker.chmod(0o600)
            LimitBucket.objects.filter(expires_at__lt=now).delete()
            Session.objects.filter(expire_date__lt=now).delete()
            Challenge.objects.filter(expires_at__lt=now-timedelta(days=7)).delete()
            UsedProof.objects.filter(used_at__lt=now-timedelta(days=60)).delete()
            Audit.objects.filter(at__lt=now-timedelta(days=90)).delete()
            self.stdout.write(f'Owner worker complete: {len(pending)} checks; export updated={changed}.')
