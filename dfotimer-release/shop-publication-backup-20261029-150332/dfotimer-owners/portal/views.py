import secrets
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import Http404, HttpResponse, FileResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST
from .domain import shop_stock, snapshot, identity, editable, issue, sanitize_image, store_image, ASSET, KEY
from .forms import RegisterForm, LoginForm, UploadForm, FeatureForm
from .models import ShopProfile, Challenge, Audit
from .security import limited, address

def error(request, exc): messages.error(request, ' '.join(exc.messages) if isinstance(exc,ValidationError) else str(exc))
def throttled(request,scope,n=10,seconds=3600): return limited(scope,address(request),n,seconds)
def slow(): return HttpResponse('Too many attempts. Please wait before trying again.',status=429)
def destination(request):
    value=request.POST.get('next') or request.GET.get('next') or request.session.get('owner_next','')
    for prefix in ('/owner/claim/','/owner/edit/'):
        if value.startswith(prefix) and value.endswith('/') and KEY.fullmatch(value[len(prefix):-1]):
            request.session['owner_next']=value
            return value
    return '/owner/'

def signup(request):
    if request.user.is_authenticated: return redirect('home')
    target=destination(request)
    form=RegisterForm(request.POST or None)
    if request.method=='POST':
        if throttled(request,'register',5) or limited('register-global','site',100,86400): return slow()
        if User.objects.count()>=5000: return HttpResponse('Registration is temporarily at capacity.',status=503)
        if form.is_valid():
            user=form.save();login(request,user)
            messages.success(request,'Website account created. Save your login in your password manager, then verify your shop.')
            return redirect(target)
    return render(request,'account.html',{'form':form,'heading':'Create an owner account','register':True,'next':target})

def signin(request):
    if request.user.is_authenticated: return redirect('home')
    target=destination(request)
    form=LoginForm(request,data=request.POST or None)
    if request.method=='POST':
        if throttled(request,'login',10,900) or limited('login-name',request.POST.get('username','').lower()[:30],30,3600): return slow()
        if form.is_valid(): login(request,form.get_user());return redirect(target)
    return render(request,'account.html',{'form':form,'heading':'Sign in to your shop dashboard','next':target})

@require_POST
def signout(request): logout(request);return redirect('signin')

@login_required
def home(request):
    from . import discovery
    if request.method=='POST':
        if request.POST.get('action')!='discover': return HttpResponse('Unknown action.',status=400)
        try:
            region=int(request.POST.get('region',''))
            name=request.POST.get('seller','').strip()
            if not 0<=region<len(discovery.REGIONS) or not 1<=len(name)<=64 or any(ord(c)<32 for c in name): raise ValueError()
            if (limited('discovery-user',str(request.user.pk),3,3600) or limited('discovery-region',str(region),1,120) or limited('discovery-global','site',20,3600)): return slow()
            request.session['shop_discovery']={'region':region,'seller':name}
            discovery.enqueue(region)
            messages.info(request,'Shop lookup queued. Use Reload results shortly. If a full inventory scan is running, this lookup waits for it to finish.')
        except (ValueError,OSError): messages.error(request,'Choose a region and enter your in-game account name (up to 64 characters).')
        return redirect('home')
    chosen=request.GET.get('shop','')
    if chosen:
        try: shop_stock(chosen);return redirect('claim',key=chosen)
        except (ValidationError,ValueError,OSError): pass
    try:
        data=snapshot(); shops=[{**s,'key':identity(s)} for s in data['shops'] if s.get('status') in ('available','unavailable')]
        shops.sort(key=lambda s:(s.get('seller','').lower(),s.get('town','')))
    except (ValueError,OSError): shops=[]
    profiles=list(ShopProfile.objects.filter(owner=request.user))
    lookup=request.session.get('shop_discovery',{});found=[];lookup_state=None;lookup_data=None
    if type(lookup.get('region')) is int and 0<=lookup['region']<len(discovery.REGIONS) and isinstance(lookup.get('seller'),str):
        lookup_state=discovery.state(lookup['region']);lookup_data=discovery.cached(lookup['region'])
        if lookup_data:
            found=[{**s,'key':identity(s)} for s in lookup_data['shops'] if s['seller'].casefold()==lookup['seller'].casefold()]
    return render(request,'home.html',{'profiles':profiles,'shops':shops,'challenges':Challenge.objects.filter(user=request.user,state='pending',expires_at__gt=timezone.now()),'now':timezone.now(),'regions':list(enumerate(discovery.REGIONS)),'lookup':lookup,'lookup_state':lookup_state,'lookup_data':lookup_data,'found_shops':found})

@login_required
def claim(request,key):
    # DFO_SHOP_REFRESH_V1: queue a shop-only live check before stale-stock validation.
    if request.method == 'POST' and request.POST.get('action') == 'refresh':
        from django.contrib import messages as refresh_messages
        from .shop_refresh import enqueue
        try:
            shop_stock(key, fresh=False)
            if ShopProfile.objects.filter(key=key, disabled=True).exists():
                raise ValidationError('This shop cannot be refreshed.')
            if (limited('refresh-user', str(request.user.pk), 3, 3600)
                    or limited('refresh-shop', key, 1, 300)
                    or limited('refresh-global', 'site', 30, 3600)):
                return slow()
            if enqueue(key):
                refresh_messages.info(request, 'Single-shop refresh queued. Reload this page shortly to see the latest items.')
            else:
                refresh_messages.info(request, 'This shop already has a refresh queued. Reload this page shortly.')
        except (ValidationError, ValueError, OSError):
            refresh_messages.error(request, 'This shop is not currently available for refresh.')
        return redirect('claim', key=key)
    try:
        try:
            shop, rows = shop_stock(key)
            stock_ready = True
        except ValidationError:
            # A known public shop may be stale; show Refresh instead of denying access.
            shop, rows = shop_stock(key, fresh=False)
            rows = []
            stock_ready = False
    except (ValidationError,ValueError,OSError) as e:
        error(request,e if isinstance(e,ValidationError) else ValidationError('The public inventory is unavailable.'));return redirect('home')
    current=ShopProfile.objects.filter(key=key).first()
    if request.method=='GET' and stock_ready and current and current.owner_id==request.user.pk and not current.disabled and current.seller==shop['seller'] and current.verified_until>timezone.now():
        return redirect('editor',key=key)
    if request.method=='POST':
        if throttled(request,'claim',10) or limited('claim-user',request.user.pk,3,3600) or limited('claim-global','site',60,3600): return slow()
        try:
            c=issue(request.user,key,request.POST.get('listing',''))
            return redirect('challenge',challenge_id=c.pk)
        except ValidationError as e: error(request,e)
    from .shop_refresh import status as get_refresh_status
    return render(request,'claim.html',{'shop':shop,'key':key,'rows':[r for r in rows if r.get('template')],'current':current,'refresh_state':get_refresh_status(key)})

@login_required
def challenge(request,challenge_id):
    c=Challenge.objects.filter(pk=challenge_id,user=request.user).first()
    if not c: raise Http404
    if c.state=='pending' and c.expires_at<=timezone.now(): c.state='expired';c.save(update_fields=['state'])
    if request.method=='POST':
        if request.POST.get('action')=='cancel' and c.state=='pending':
            c.state='cancelled';c.save(update_fields=['state']);return redirect('home')
        if c.state=='pending' and not c.requested_at:
            if limited('verify-user',request.user.pk,1,60) or c.attempts>=12: return slow()
            c.requested_at=timezone.now();c.save(update_fields=['requested_at'])
        return redirect('challenge',challenge_id=c.pk)
    return render(request,'challenge.html',{'challenge':c})

@login_required
def editor(request,key):
    try: profile,shop,rows=editable(request.user,key)
    except (ValidationError,ValueError,OSError):
        messages.error(request,'Please verify this shop, or wait for a fresh public scan, before editing.');return redirect('claim',key=key)
    feature_form=FeatureForm(rows=rows,initial_ids=profile.featured)
    upload_form=UploadForm()
    if request.method=='POST':
        if limited('edit-user',request.user.pk,30,3600): return slow()
        action=request.POST.get('action','')
        try:
            if action in ('banner','gallery'):
                if limited('upload-user',request.user.pk,12,3600) or limited('upload-global','site',200,3600): return slow()
                upload_form=UploadForm(request.POST,request.FILES)
                if not upload_form.is_valid(): raise ValidationError('Choose a supported image and a description of at most 120 characters.')
                data=sanitize_image(upload_form.cleaned_data['image'],action)
                with transaction.atomic():
                    profile,_,_=editable(request.user,key)
                    if action=='gallery' and len(profile.gallery)>=4: raise ValidationError('Remove a screenshot before adding another. Each shop has four gallery slots.')
                    name=store_image(data)
                    if action=='banner': profile.banner=name
                    else: profile.gallery=profile.gallery+[{'file':name,'caption':upload_form.cleaned_data['caption']}]
                    profile.save()
            elif action=='featured':
                feature_form=FeatureForm(request.POST,rows=rows)
                if not feature_form.is_valid(): raise ValidationError('Choose up to three different listings from the current stock.')
                with transaction.atomic():
                    profile,_,_=editable(request.user,key)
                    profile.featured=[feature_form.cleaned_data[k] for k in ('first','second','third') if feature_form.cleaned_data[k]];profile.save()
            elif action=='remove-banner':
                with transaction.atomic():
                    profile,_,_=editable(request.user,key);profile.banner='';profile.save()
            elif action=='remove-gallery':
                with transaction.atomic():
                    profile,_,_=editable(request.user,key)
                    profile.gallery=[g for g in profile.gallery if g['file']!=request.POST.get('file')];profile.save()
            else: raise ValidationError('Unknown action.')
            Audit.objects.create(action=action,shop_key=key,user_id_value=request.user.pk)
            messages.success(request,'Saved. Your public shop and Discord image will update within a few minutes. Existing Discord posts may keep a cached preview.')
            return redirect('editor',key=key)
        except ValidationError as e: error(request,e)
    return render(request,'editor.html',{'profile':profile,'shop':shop,'key':key,'feature_form':feature_form,'upload_form':upload_form})

@login_required
def image_preview(request,name):
    if not ASSET.fullmatch(name): raise Http404
    owned=ShopProfile.objects.filter(owner=request.user,disabled=False,verified_until__gt=timezone.now())
    if not any(p.banner==name or any(g.get('file')==name for g in p.gallery) for p in owned): raise Http404
    path=settings.MEDIA_ROOT/name
    if not path.is_file() or path.is_symlink(): raise Http404
    return FileResponse(path.open('rb'),content_type='image/jpeg')

@login_required
def password(request):
    from django.contrib.auth.forms import PasswordChangeForm
    from django.contrib.auth import update_session_auth_hash
    form=PasswordChangeForm(request.user,request.POST or None)
    if request.method=='POST':
        if throttled(request,'password',5): return slow()
        if form.is_valid(): user=form.save();update_session_auth_hash(request,user);messages.success(request,'Password changed.');return redirect('home')
    return render(request,'account.html',{'form':form,'heading':'Change website password'})
