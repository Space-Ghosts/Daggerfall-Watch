import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
import io
from unittest.mock import patch
from PIL import Image
spec=importlib.util.spec_from_file_location('publisher',Path(__file__).with_name('publish.py'))
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)

class PublisherTests(unittest.TestCase):
    def test_owner_selection_fallback_banner_and_gallery_escape(self):
        shop={'map':123,'vendorId':'abc','seller':'Trader','town':'Town','region':'Region','checkedAt':int(time.time()*1000),'status':'available'}
        rows=[{'id':str(i),'name':'Item '+str(i),'rarity':'common','quantity':1,'price':100+i,'currency':'gold'} for i in range(5)]
        profile={'featured':['4','sold','2'],'banner':'a'*32+'.jpg','gallery':[{'file':'b'*32+'.jpg','caption':'<img onerror=alert(1)>'}],'seller':'Trader','verifiedUntil':time.time()*1000+100000}
        self.assertEqual([r['id'] for r in publisher.featured_rows(rows,profile)],['4','2','0'])
        with tempfile.TemporaryDirectory() as tmp:
            media=Path(tmp);Image.new('RGB',(1440,240),'#901020').save(media/profile['banner'],'JPEG');Image.new('RGB',(300,200),'blue').save(media/profile['gallery'][0]['file'],'JPEG')
            clean=publisher.safe_profile(profile,shop,media);self.assertTrue(clean['banner'])
            card=Image.open(io.BytesIO(publisher.card(shop,rows,None,False,clean,media)))
            self.assertEqual(card.size,(1200,630));self.assertLess(abs(card.getpixel((500,100))[0]-144),5)
            doc=publisher.document(shop,rows,'revision',False,clean).decode()
            self.assertIn('shop-owner-banner',doc);self.assertIn('&lt;img onerror=',doc);self.assertNotIn('<img onerror=',doc)
            self.assertNotIn('@@',doc);self.assertIn('/owner/claim/123/616263/',doc)
            profile['banner']='../../escape.jpg';self.assertFalse(publisher.safe_profile(profile,shop,media)['banner'])
            profile['verifiedUntil']=0;self.assertIsNone(publisher.safe_profile(profile,shop,media))
            profile['verifiedUntil']=time.time()*1000+10000;profile['seller']='Impostor';self.assertIsNone(publisher.safe_profile(profile,shop,media))

    def test_identity_and_untrusted_markup(self):
        self.assertEqual(publisher.identity({'map':123,'vendorId':'abc'}),'123/616263')
        self.assertEqual(publisher.identity({'map':123,'vendorId':'../../escape'}),'123/2e2e2f2e2e2f657363617065')
        self.assertEqual(publisher.identity({'map':123,'vendorId':'é'}),'123/c3a9')
        for value in [{'map':0,'vendorId':'x'},{'map':True,'vendorId':'x'},{'map':123,'vendorId':'\x00'},{'map':123,'vendorId':'x'*129}]:
            with self.assertRaises(ValueError):publisher.identity(value)
        shop={'map':123,'vendorId':'x','seller':'<script>alert(1)</script>','town':'<img src=x onerror=alert(1)>','region':'Test','status':'available','checkedAt':1}
        doc=publisher.document(shop,[],'test',False).decode()
        self.assertNotIn('<script>alert',doc);self.assertNotIn('<img src=x',doc)
        self.assertIn('&lt;script&gt;',doc)
        self.assertIn('property="og:image" content="https://dfo.spaceghosts.com/shops/123/78/preview.png?v=test"',doc)

    def test_publish_refresh_empty_and_missing_do_not_keep_old_stock(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'public';root.mkdir();state=Path(temp)/'private';now=int(time.time()*1000)
            shop={'map':123,'vendorId':'abc','seller':'Trader','town':'Town','region':'Region','checkedAt':now,'status':'available'}
            row={**shop,'id':'one','name':'Gold Sword','rarity':'gilded','quantity':2,'price':100,'currency':'gold','expiresAt':now+600000}
            snapshot={'version':1,'updatedAt':now,'listings':[row], 'shops':[shop]}
            def build():
                (root/'vendors.json').write_text(json.dumps(snapshot),encoding='utf-8');publisher.build(root,state)
            build();page=root/'shops/123/616263/index.html';image=page.with_name('preview.png')
            with Image.open(image) as loaded:self.assertEqual(loaded.size,(1200,630))
            self.assertIn('Gold Sword',page.read_text(encoding='utf-8'))
            first=page.stat().st_mtime_ns;build();self.assertEqual(page.stat().st_mtime_ns,first)
            snapshot['shops'][0]['status']='unavailable';build()
            self.assertNotIn('Gold Sword',page.read_text(encoding='utf-8'))
            snapshot['shops']=[];snapshot['listings']=[];build()
            self.assertTrue(page.is_file());self.assertIn('Stock is unavailable',page.read_text(encoding='utf-8'))
            self.assertFalse((root/'catalog.json').exists())

if __name__=='__main__':unittest.main()
