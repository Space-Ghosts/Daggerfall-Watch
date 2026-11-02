import io, json, re, secrets, warnings
from datetime import timedelta
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction, IntegrityError
from django.utils import timezone
from .models import ShopProfile, Challenge, UsedProof, Audit

KEY = re.compile(r'([1-9][0-9]{0,9})/([a-f0-9]{2,256})\Z')
ASSET = re.compile(r'[a-f0-9]{32}\.jpg\Z')

def identity(shop):
    mid, vid = shop.get('map'), shop.get('vendorId')
    if type(mid) is not int or not 0 < mid <= 0xffffffff or not isinstance(vid,str) or not 0 < len(vid.encode()) <= 128:
        raise ValueError('Invalid shop')
    return f'{mid}/{vid.encode().hex()}'

def snapshot():
    if settings.SNAPSHOT.stat().st_size > 32*1024*1024: raise ValueError('Invalid snapshot')
    data = json.loads(settings.SNAPSHOT.read_text(encoding='utf-8'))
    if data.get('version') != 1 or not isinstance(data.get('shops'),list): raise ValueError('Invalid snapshot')
    return data

def shop_stock(key, fresh=True):
    if not isinstance(key,str) or not KEY.fullmatch(key): raise ValidationError('Choose a shop from the directory.')
    data = snapshot()
    shop = next((s for s in data['shops'] if identity(s)==key), None)
    # DFO_SHOP_REFRESH_V1: prefer a recent privately verified shop read.
    from .shop_refresh import cached
    proof = cached(key)
    if proof and shop and proof['shop'].get('seller') == shop.get('seller') and proof['shop'].get('checkedAt', 0) >= (shop.get('checkedAt') or 0):
        shop = proof['shop']
        data = {**data, 'listings': proof['rows']}
    now = timezone.now().timestamp()*1000
    if not shop or shop.get('status') != 'available' or (fresh and now-(shop.get('checkedAt') or 0)>2*3600*1000):
        raise ValidationError('A recent public scan of this shop is needed. Please try after its next inventory update.')
    rows = [r for r in data['listings'] if identity(r)==key and r.get('expiresAt',0)>now and r.get('quantity',0)>0]
    return shop, rows

def editable(user, key):
    profile = ShopProfile.objects.filter(key=key,owner=user,disabled=False,verified_until__gt=timezone.now()).first()
    if not profile: raise ValidationError('Verify ownership of this shop before editing it.')
    shop, rows = shop_stock(key)
    if shop.get('seller') != profile.seller: raise ValidationError('The shop owner changed. Please verify ownership again.')
    return profile, shop, rows

def issue(user, key, listing_id):
    shop, rows = shop_stock(key)
    if ShopProfile.objects.filter(key=key,disabled=True).exists(): raise ValidationError('This shop’s customization is disabled. Contact the site operator.')
    chosen = next((r for r in rows if r['id']==listing_id and r.get('template')),None)
    if not chosen: raise ValidationError('Choose an item currently listed by this shop.')
    with transaction.atomic():
        active = Challenge.objects.filter(user=user,state='pending',expires_at__gt=timezone.now())
        if active.exists(): raise ValidationError('Finish or cancel your existing verification first.')
        prices = set(Challenge.objects.filter(state='pending',expires_at__gt=timezone.now()).values_list('price',flat=True)) | {r['price'] for r in rows}
        price = 100000 + secrets.randbelow(900000)
        while price in prices: price = 100000 + secrets.randbelow(900000)
        return Challenge.objects.create(id=secrets.token_urlsafe(24),user=user,shop_key=key,seller=shop['seller'],item_name=chosen['name'],template=chosen['template'],material=chosen.get('material',''),category=chosen.get('category',''),price=price,prior_ids=[r['id'] for r in rows],expires_at=timezone.now()+timedelta(hours=2))

def accept_proof(challenge_id, proof):
    """Only the private worker supplies proof, freshly read from the game service."""
    now = timezone.now()
    with transaction.atomic():
        c = Challenge.objects.select_for_update().get(pk=challenge_id)
        if c.state != 'pending' or c.expires_at <= now: return False
        shop = proof.get('shop',{})
        try: key = identity(shop)
        except (ValueError,AttributeError): return False
        if key != c.shop_key or shop.get('seller') != c.seller or shop.get('status') != 'available': return False
        checked = proof.get('checkedAt',0)
        if not isinstance(checked,(int,float)) or not now.timestamp()*1000-120000 <= checked <= now.timestamp()*1000+5000: return False
        if ShopProfile.objects.filter(key=key,disabled=True).exists(): return False
        matched = None
        for row in proof.get('rows',[]):
            try:
                valid = identity(row)==key and row.get('seller')==c.seller and row.get('template')==c.template and row.get('material','')==c.material and row.get('category','')==c.category and row.get('price')==c.price and row.get('currency')=='gold' and row.get('quantity')==1 and row.get('expiresAt',0)>now.timestamp()*1000 and row.get('listedAt',0)>=int(c.created_at.timestamp()+1)*1000 and row.get('id') not in c.prior_ids and isinstance(row.get('id'),str) and 0<len(row['id'])<=128
            except (TypeError,ValueError): valid = False
            if valid: matched = row['id']; break
        if not matched or UsedProof.objects.filter(listing=matched).exists(): return False
        UsedProof.objects.create(listing=matched)
        old = ShopProfile.objects.filter(key=key).first()
        profile, _ = ShopProfile.objects.update_or_create(key=key,defaults={'owner':c.user,'seller':c.seller,'verified_until':now+timedelta(days=30)})
        if old and old.owner_id != c.user_id:
            profile.banner='';profile.gallery=[];profile.featured=[];profile.save()
        c.state='verified';c.matched_listing=matched;c.save(update_fields=['state','matched_listing'])
        Challenge.objects.filter(shop_key=key,state='pending').exclude(pk=c.pk).update(state='cancelled')
        Audit.objects.create(action='verified',shop_key=key,user_id_value=c.user_id)
        return True

def sanitize_image(upload, kind):
    if upload.size > 5*1024*1024: raise ValidationError('Images must be 5 MB or smaller.')
    raw = upload.read(5*1024*1024+1)
    if not raw or len(raw)>5*1024*1024: raise ValidationError('Images must be 5 MB or smaller.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw),formats=['JPEG','PNG','WEBP']) as source:
                if source.width*source.height > 12_000_000 or min(source.size)<100 or max(source.size)>10000 or getattr(source,'n_frames',1)!=1:
                    raise ValueError('Image dimensions')
                source.load(); im=ImageOps.exif_transpose(source).convert('RGB')
                if kind=='banner': im=ImageOps.fit(im,(1440,240),method=Image.Resampling.LANCZOS)
                else: im.thumbnail((1600,1200),Image.Resampling.LANCZOS)
                # New pixel buffer deliberately discards EXIF, comments and other metadata.
                clean=Image.new('RGB',im.size);clean.paste(im)
                result=io.BytesIO();clean.save(result,'JPEG',quality=86,optimize=True)
                return result.getvalue()
    except (OSError,ValueError,UnidentifiedImageError,Image.DecompressionBombWarning,Image.DecompressionBombError):
        raise ValidationError('Use a single-frame JPG, PNG or WebP between 100 pixels and 12 megapixels. Banners are center-cropped to 6:1.') from None

def store_image(data):
    # Called inside the profile write transaction, so concurrent uploads cannot
    # race the storage budget. Replaced uploads are pruned by the private worker.
    used=sum(p.stat().st_size for p in settings.MEDIA_ROOT.iterdir() if p.is_file() and not p.is_symlink())
    if used+len(data)>2*1024*1024*1024: raise ValidationError('Image storage is temporarily full. Please try later.')
    name=secrets.token_hex(16)+'.jpg'
    with (settings.MEDIA_ROOT/name).open('xb') as file: file.write(data)
    (settings.MEDIA_ROOT/name).chmod(0o600)
    return name
