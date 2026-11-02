// Operator-only targeted refresh; same public-directory gate and projection as the hourly scan.
import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {publicListing,publicShop} from './vendor-core.mjs';
const [mapArg,id]=process.argv.slice(2),map=Number(mapArg);
if(!Number.isSafeInteger(map)||map<1||!id||id.length>128)throw Error('Invalid shop identity');
const local=n=>new URL(n,import.meta.url),json=async n=>JSON.parse(await readFile(local(n),'utf8'));
const output='/var/www/lastlife-hub/daggerfall/vendors.json';
const before=JSON.parse(await readFile(output,'utf8'));
const previous=before.shops?.find(
 s=>s.map===map&&s.vendorId===id&&s.status==='available'
);
if(!previous)throw Error('Shop is not in the published public directory');
const {REGION_NAMES}=await import('./vendor-reference.mjs');
const region=REGION_NAMES.indexOf(previous.region);if(region<0)throw Error('Unknown region');
const session=await json('./private/session.json');
async function call(path,body){
 const r=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/market/'+path,{method:'POST',headers:{Authorization:`Bearer ${session.secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!r.ok)throw Error('Inventory read unavailable: '+r.status);
 const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>8*1024*1024)throw Error('Response too large');chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const directory=await call('vendors',{region});
const found=directory.rows?.find(r=>r.vendor?.map===map&&r.vendor?.id===id&&r.home?.entry==='public');
if(!found)throw Error('Shop is not in current public directory');
const vendor={...found.vendor,entry:'public',owner:found.owner,buildingKey:found.buildingKey,region};
await sleep(2200);
const stock=await call('vendor',{vendor:{map,id}});
if(stock.error||stock.vendor?.map!==map||stock.vendor?.id!==id||!Array.isArray(stock.rows))throw Error('Shop stock not verified');
const now=Date.now(),names=Object.fromEntries((await json('./item-names.json')).map(r=>[r.index,r.name])),towns=await json('./town-names.json'),books=await json('./book-names.json');
const listings=stock.rows.map(r=>publicListing(r,vendor,{names,towns,books,now})).filter(Boolean);
const current=JSON.parse(await readFile(output,'utf8'));
if(current.listings.some(r=>r.map===map&&r.vendorId===id&&r.checkedAt>now))throw Error('Newer scan already published');
current.listings=current.listings.filter(r=>r.map!==map||r.vendorId!==id).concat(listings);
if(Array.isArray(current.shops))current.shops=current.shops.filter(r=>r.map!==map||r.vendorId!==id).concat(publicShop(vendor,{towns,checkedAt:now}));
// Keep the full-directory scan timestamp and coverage; only this shop was refreshed.
const pending=output+'.shop-refresh';await writeFile(pending,JSON.stringify(current),{mode:0o644});await chmod(pending,0o644);await rename(pending,output);
console.log(JSON.stringify({seller:previous.seller,listings:listings.length,withStats:listings.filter(r=>r.statLines?.length).length,sample:listings.filter(r=>r.name==='Aegis of Dawn'||r.category==='Weapons').slice(0,3).map(({name,equipmentType,statLines})=>({name,equipmentType,statLines}))}));
