import copy, io, json, tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, Client, override_settings
from django.utils import timezone
from .domain import issue, accept_proof, editable, sanitize_image, identity
from .models import Challenge, ShopProfile, UsedProof, LimitBucket
from .security import limited

class OwnerTests(TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.media=self.root/'media';self.media.mkdir()
        self.snap=self.root/'vendors.json'
        self.settings=override_settings(LOCAL=True,SNAPSHOT=self.snap,MEDIA_ROOT=self.media,PRIVATE=self.root,ALLOWED_HOSTS=['testserver'],SESSION_COOKIE_SECURE=False,CSRF_COOKIE_SECURE=False,SECURE_SSL_REDIRECT=False)
        self.settings.enable();self.addCleanup(self.settings.disable)
        self.user=User.objects.create_user('keeper',password='A-long-random-test-password!')
        self.other=User.objects.create_user('intruder',password='Another-long-test-password!')
        self.now=timezone.now();ms=int(self.now.timestamp()*1000)
        self.shop={'map':42,'vendorId':'vendor1','seller':'Ardgon','town':'Longwall','region':'Daggerfall','status':'available','checkedAt':ms}
        self.row={**self.shop,'id':'old-listing','name':'Iron Boots','template':'Boots','material':'Iron','category':'Armor','quantity':1,'price':100,'currency':'gold','listedAt':ms-86400000,'expiresAt':ms+86400000}
        self.key=identity(self.shop)
        self.snap.write_text(json.dumps({'version':1,'updatedAt':ms,'shops':[self.shop],'listings':[self.row]}))
        self.client.force_login(self.user)
    def challenge(self): return issue(self.user,self.key,self.row['id'])
    def proof(self,c):
        return {'checkedAt':int(timezone.now().timestamp()*1000),'shop':dict(self.shop),'rows':[{**self.row,'id':'new-listing','listedAt':int(c.created_at.timestamp()+2)*1000,'price':c.price}]}
    def owned(self):
        return ShopProfile.objects.create(key=self.key,owner=self.user,seller='Ardgon',verified_until=self.now+timedelta(days=30))
    def post(self,path,data):return self.client.post(path,data,HTTP_ORIGIN='http://testserver')
    def test_fresh_exact_proof_claims_once(self):
        c=self.challenge();self.assertTrue(accept_proof(c.pk,self.proof(c)))
        self.assertFalse(accept_proof(c.pk,self.proof(c)))
        self.assertEqual(ShopProfile.objects.get().owner,self.user)
    def test_wrong_shop_seller_currency_quantity_and_template_refused(self):
        c=self.challenge()
        for change in [{'map':43},{'seller':'Other'},{'currency':'marks'},{'quantity':2},{'template':'Helm'},{'material':'Steel'},{'price':c.price+1}]:
            p=self.proof(c);p['rows'][0].update(change)
            self.assertFalse(accept_proof(c.pk,p),change)
        p=self.proof(c);p['shop']['seller']='Other';self.assertFalse(accept_proof(c.pk,p))
        self.assertFalse(ShopProfile.objects.exists())
    def test_old_listing_stale_proof_and_expired_challenge_refused(self):
        c=self.challenge()
        for field,value in [('id','old-listing'),('listedAt',int(c.created_at.timestamp()*1000)-1000)]:
            p=self.proof(c);p['rows'][0][field]=value;self.assertFalse(accept_proof(c.pk,p))
        p=self.proof(c);p['checkedAt']-=180000;self.assertFalse(accept_proof(c.pk,p))
        c.expires_at=self.now-timedelta(seconds=1);c.save();self.assertFalse(accept_proof(c.pk,self.proof(c)))
    def test_proof_cannot_be_reused_for_new_account(self):
        c=self.challenge();p=self.proof(c);UsedProof.objects.create(listing=p['rows'][0]['id'])
        self.assertFalse(accept_proof(c.pk,p))
    def test_recovery_revokes_previous_owner_and_clears_customization(self):
        old=self.owned();old.owner=self.other;old.banner='a'*32+'.jpg';old.featured=['old-listing'];old.save()
        c=self.challenge();self.assertTrue(accept_proof(c.pk,self.proof(c)))
        old.refresh_from_db();self.assertEqual(old.owner,self.user);self.assertEqual(old.banner,'');self.assertEqual(old.featured,[])
        with self.assertRaises(ValidationError):editable(self.other,self.key)
    def test_disabled_profile_cannot_be_claimed_or_edited(self):
        p=self.owned();p.disabled=True;p.save()
        with self.assertRaises(ValidationError):self.challenge()
        with self.assertRaises(ValidationError):editable(self.user,self.key)
    def test_idor_cannot_change_other_shop_or_view_its_images(self):
        p=self.owned();p.banner='a'*32+'.jpg';p.save();self.client.force_login(self.other)
        response=self.post('/owner/edit/'+self.key+'/',{'action':'remove-banner'})
        self.assertEqual(response.status_code,302);p.refresh_from_db();self.assertTrue(p.banner)
        self.assertEqual(self.client.get('/owner/image/'+p.banner+'/').status_code,404)
        c=issue(self.user,self.key,'old-listing');self.assertEqual(self.client.get('/owner/challenge/'+c.pk+'/').status_code,404)
    def test_mutations_need_same_origin_and_csrf(self):
        self.owned()
        self.assertEqual(self.client.post('/owner/edit/'+self.key+'/',{'action':'remove-banner'},HTTP_ORIGIN='https://evil.example').status_code,403)
        client=Client(enforce_csrf_checks=True);client.force_login(self.user)
        self.assertEqual(client.post('/owner/edit/'+self.key+'/',{'action':'remove-banner'},HTTP_ORIGIN='http://testserver').status_code,403)
        self.assertEqual(client.get('/owner/logout/').status_code,405)
    def test_featured_rejects_foreign_listing_duplicates(self):
        p=self.owned()
        for value in [{'first':'other-shop-listing'},{'first':'old-listing','second':'old-listing'}]:
            self.post('/owner/edit/'+self.key+'/',{'action':'featured',**value});p.refresh_from_db();self.assertEqual(p.featured,[])
        self.post('/owner/edit/'+self.key+'/',{'action':'featured','first':'old-listing'})
        p.refresh_from_db();self.assertEqual(p.featured,['old-listing'])
    def test_images_reencoded_metadata_removed_bad_files_rejected(self):
        stream=io.BytesIO();im=Image.new('RGB',(800,400),'red');exif=Image.Exif();exif[315]='private author';im.save(stream,'JPEG',exif=exif)
        result=sanitize_image(SimpleUploadedFile('evil.html',stream.getvalue()),'banner')
        clean=Image.open(io.BytesIO(result));self.assertEqual(clean.size,(1440,240));self.assertFalse(clean.getexif());self.assertEqual(clean.format,'JPEG')
        for raw in [b'<svg onload="alert(1)"></svg>',b'not an image']:
            with self.assertRaises(ValidationError):sanitize_image(SimpleUploadedFile('image.png',raw),'gallery')
        stream=io.BytesIO();Image.new('RGB',(20,20)).save(stream,'PNG')
        with self.assertRaises(ValidationError):sanitize_image(SimpleUploadedFile('tiny.png',stream.getvalue()),'gallery')
    def test_gallery_cap_and_escaping(self):
        p=self.owned();p.gallery=[{'file':f'{i:032x}.jpg','caption':'<script>alert(1)</script>'} for i in range(4)];p.save()
        stream=io.BytesIO();Image.new('RGB',(200,200)).save(stream,'PNG')
        self.post('/owner/edit/'+self.key+'/',{'action':'gallery','image':SimpleUploadedFile('s.png',stream.getvalue())})
        p.refresh_from_db();self.assertEqual(len(p.gallery),4)
        body=self.client.get('/owner/edit/'+self.key+'/').content.decode();self.assertNotIn('<script>alert',body);self.assertIn('&lt;script&gt;',body)
    def test_rate_limits_and_private_headers(self):
        self.assertFalse(limited('test','a',1,3600));self.assertTrue(limited('test','a',1,3600))
        r=self.client.get('/owner/');self.assertEqual(r['Cache-Control'],'no-store');self.assertIn("frame-ancestors 'none'",r['Content-Security-Policy'])
        self.assertEqual(self.client.get('/private/owners.sqlite3').status_code,404)
    @override_settings(LOCAL=False,ALLOWED_HOSTS=['dfo.spaceghosts.com'])
    def test_backend_rejects_missing_proxy_key_and_wrong_host(self):
        self.assertEqual(self.client.get('/owner/',HTTP_HOST='dfo.spaceghosts.com').status_code,404)
        r=self.client.get('/owner/',HTTP_HOST='evil.example',HTTP_X_DFO_PROXY_KEY=settings.PROXY_KEY,HTTP_X_FORWARDED_PROTO='https')
        self.assertEqual(r.status_code,400)
    def test_expired_or_changed_game_owner_cannot_edit(self):
        p=self.owned();p.seller='Someone else';p.save()
        with self.assertRaises(ValidationError):editable(self.user,self.key)
        p.seller='Ardgon';p.verified_until=self.now-timedelta(seconds=1);p.save()
        with self.assertRaises(ValidationError):editable(self.user,self.key)
