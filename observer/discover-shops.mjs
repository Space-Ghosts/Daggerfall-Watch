// Private worker entry: one region, public directory metadata only.
import {readFile} from 'node:fs/promises';
import {createMarketReader} from './market-reader.mjs';
import {publicShop,vendorKey} from './vendor-core.mjs';
import {REGION_NAMES} from './vendor-reference.mjs';
const region=Number(process.argv[2]);
if(!/^\d{1,2}$/.test(process.argv[2]||'')||!Number.isInteger(region)||region<0||region>=REGION_NAMES.length)throw Error('Invalid region');
const json=async n=>JSON.parse(await readFile(new URL(n,import.meta.url),'utf8'));
try{
 const session=await json('./private/session.json');
 const {call}=createMarketReader({secret:session.secret,retryBudget:2});
 const data=await call('vendors',{region}),checkedAt=Date.now(),towns=await json('./town-names.json');
 const shops=new Map();
 for(const row of data.rows){
  if(row.home?.entry!=='public'||!vendorKey(row.vendor))continue;
  const shop=publicShop({...row.vendor,owner:row.owner,buildingKey:row.buildingKey,region,entry:'public'},{towns,checkedAt,status:'discovered'});
  if(shop)shops.set(vendorKey(row.vendor),shop);
 }
 if(shops.size>600)throw Error('Oversized directory');
 process.stdout.write(JSON.stringify({region,checkedAt,capped:shops.size>=300,shops:[...shops.values()]}));
}catch{process.stderr.write('Public shop directory read unavailable\n');process.exitCode=1;}
