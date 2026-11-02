import hashlib, hmac, time
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from .models import LimitBucket

def limited(scope, identity, count, seconds):
    now = timezone.now()
    key = hmac.new(settings.SECRET_KEY.encode(), f'{scope}:{identity}:{int(time.time())//seconds}'.encode(), hashlib.sha256).hexdigest()
    with transaction.atomic():
        bucket, _ = LimitBucket.objects.get_or_create(key=key, defaults={'expires_at': now+timedelta(seconds=seconds*2)})
        if bucket.count >= count:
            return True
        bucket.count += 1
        bucket.save(update_fields=['count'])
    return False

def address(request):
    return request.META.get('REMOTE_ADDR', '') if settings.LOCAL else request.headers.get('X-Dfo-Client-IP', '')[:80]

class Boundary:
    def __init__(self, get_response): self.get_response = get_response
    def __call__(self, request):
        if not settings.LOCAL and not hmac.compare_digest(request.headers.get('X-Dfo-Proxy-Key', ''), settings.PROXY_KEY):
            return HttpResponse('Not found', status=404)
        if not request.path.startswith('/owner/') or request.method not in ('GET','HEAD','POST'):
            return HttpResponse('Not found', status=404)
        if request.method == 'POST':
            # No cross-origin writes, including browser forms without an Origin.
            origin = request.headers.get('Origin')
            expected = f'http://{request.get_host()}' if settings.LOCAL else settings.PUBLIC_ORIGIN
            if origin != expected:
                return HttpResponse('Please reload this page before submitting.', status=403)
            try: length = int(request.headers.get('Content-Length', '0'))
            except ValueError: length = -1
            maximum=6*1024*1024 if request.path.startswith('/owner/edit/') else 32768
            if length < 0 or length > maximum:
                return HttpResponse('Upload is too large.', status=413)
        if limited('requests', address(request), 120, 60):
            return HttpResponse('Too many requests. Try again in a minute.', status=429)
        response = self.get_response(request)
        response['Cache-Control'] = 'no-store'
        response['Content-Security-Policy'] = "default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        response['X-Frame-Options'] = 'DENY'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Referrer-Policy'] = 'no-referrer'
        response['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=(), payment=()'
        return response
