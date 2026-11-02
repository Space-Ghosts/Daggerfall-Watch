import copy,hashlib,importlib.util,json,tempfile,time,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('writer',Path(__file__).with_name('publish-stock.py'));writer=importlib.util.module_from_spec(spec);spec.loader.exec_module(writer)
class WriterTests(unittest.TestCase):
    def setUp(self):
        self.now=time.time()*1000
        self.shop={'map':42,'vendorId':'vendor','seller':'Current Owner','town':'Daggerfall','region':'Daggerfall','status':'available','checkedAt':self.now}
        self.row={**self.shop,'id':'one','name':'Boots','price':10,'quantity':1,'expiresAt':self.now+60000}
        self.proof={'shop':self.shop,'rows':[self.row],'checkedAt':self.now}
        self.snapshot={'version':1,'startedAt':self.now-10000,'updatedAt':self.now-5000,'shops':[],'listings':[],'coverage':{'vendorsDiscovered':0,'vendorsChecked':0,'complete':False,'failedVendorCount':1}}
    def test_new_shop_is_published_without_changing_full_scan_time(self):
        d=writer.merge(self.snapshot,[self.proof],self.now)
        self.assertEqual(d['shops'],[self.shop]);self.assertEqual(d['listings'],[self.row]);self.assertEqual(d['updatedAt'],self.now-5000);self.assertFalse(d['coverage']['complete'])
        writer.merge(d,[self.proof],self.now);self.assertEqual(d['coverage']['vendorsDiscovered'],1)
    def test_scan_finishing_after_refresh_keeps_new_shop_but_later_scan_wins(self):
        self.snapshot['updatedAt']=self.now+2000
        self.assertEqual(len(writer.merge(copy.deepcopy(self.snapshot),[self.proof],self.now)['shops']),1)
        self.snapshot['startedAt']=self.now+1000
        self.assertEqual(writer.merge(self.snapshot,[self.proof],self.now)['shops'],[])
    def test_transfer_replaces_only_target_stock_and_empty_refresh_removes_sold_items(self):
        old={**self.shop,'seller':'Previous Owner','checkedAt':self.now-1000};other={**self.shop,'vendorId':'other'}
        self.snapshot['shops']=[old,other];self.snapshot['listings']=[{**self.row,'seller':'Previous Owner'},{**self.row,'vendorId':'other'}]
        self.proof['rows']=[];d=writer.merge(self.snapshot,[self.proof],self.now)
        self.assertEqual(d['listings'][0]['vendorId'],'other');self.assertEqual(len(d['listings']),1);self.assertEqual(d['shops'][-1]['seller'],'Current Owner')
    def test_newer_full_scan_stock_wins_over_old_refresh(self):
        self.snapshot['shops']=[{**self.shop,'checkedAt':self.now+1000}]
        self.snapshot['listings']=[]
        self.assertEqual(writer.merge(self.snapshot,[self.proof],self.now)['listings'],[])
    def test_wrong_owner_expired_and_mismatched_rows_are_rejected(self):
        bad=copy.deepcopy(self.proof);bad['rows'][0]['seller']='Other'
        self.assertEqual(writer.merge(copy.deepcopy(self.snapshot),[bad],self.now)['shops'],[])
        self.assertEqual(writer.merge(copy.deepcopy(self.snapshot),[self.proof],self.now+7200001)['shops'],[])
        bad=copy.deepcopy(self.proof);bad['rows'][0]['vendorId']='different'
        self.assertEqual(writer.merge(copy.deepcopy(self.snapshot),[bad],self.now)['shops'],[])
    def test_disk_write_and_repeated_delivery_are_idempotent(self):
        # The file-lock implementation is exercised on Linux during release verification.
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);output=root/'vendors.json';pending=root/'pending';pending.mkdir();output.write_text(json.dumps(self.snapshot))
            (pending/(hashlib.sha256(writer.key(self.shop).encode()).hexdigest()+'.json')).write_text(json.dumps(self.proof))
            self.assertTrue(writer.write(output,pending));self.assertFalse(writer.write(output,pending));self.assertEqual(len(json.loads(output.read_text())['shops']),1)
if __name__=='__main__':unittest.main()
