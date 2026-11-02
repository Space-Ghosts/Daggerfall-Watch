// Private, read-only verifier. Only the scheduled owner worker invokes this.
import {readFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {publicListing,publicShop} from './vendor-core.mjs';
import {REGION_NAMES} from './vendor-reference.mjs';
const [mapArg,hex,regionArg]=process.argv.slice(2),map=Number(mapArg);
if(!Number.isInteger(map)||map<1||map>0xffffffff||!/^([a-f0-9]{2}){1,128}$/.test(hex||''))throw Error('Invalid shop');
const id=Buffer.from(hex,'hex').toString('utf8');
if(Buffer.from(id).toString('hex')!==hex)throw Error('Invalid identity');
const local=n=>new URL(n,import.meta.url),json=async n=>JSON.parse(await readFile(local(n),'utf8'));
let region;
if(regionArg!==undefined){
 if(!/^\d{1,2}$/.test(regionArg))throw Error('Unknown region');
 region=Number(regionArg);
}else{
 const snapshot=JSON.parse(await readFile('/var/www/lastlife-hub/daggerfall/vendors.json','utf8'));
 const shop=snapshot.shops?.find(s=>s.map===map&&s.vendorId===id);
 region=REGION_NAMES.indexOf(shop?.region);
}
if(region<0||region>=REGION_NAMES.length)throw Error('Unknown region');
const session=await json('./private/session.json');
async function call(path,body){
 const response=await fetch('https://daggerfall-accounts.mackcothran.workers.dev/v1/market/'+path,{method:'POST',headers:{Authorization:`Bearer ${session.secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('Game unavailable');
 let size=0;const chunks=[];for await(const c of response.body){size+=c.length;if(size>8*1024*1024)throw Error('Response too large');chunks.push(c);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
try{
 const directory=await call('vendors',{region});
 const found=directory.rows?.find(r=>r.vendor?.map===map&&r.vendor?.id===id&&r.home?.entry==='public');
 if(!found)throw Error('Not in public directory');
 const vendor={...found.vendor,owner:found.owner,buildingKey:found.buildingKey,region,entry:'public'};
 await sleep(2200);
 const stock=await call('vendor',{vendor:{map,id}});
 if(stock.error||stock.vendor?.map!==map||stock.vendor?.id!==id||!Array.isArray(stock.rows)||stock.rows.length>300)throw Error('Invalid stock');
 // Refuse a transfer racing discovery; do not label new stock as the old owner's.
 if(stock.vendor.owner!==found.owner||stock.vendor.buildingKey!==found.buildingKey)throw Error('Shop changed during verification');
 const checkedAt=Date.now(),towns=await json('./town-names.json'),books=await json('./book-names.json'),names=Object.fromEntries((await json('./item-names.json')).map(r=>[r.index,r.name]));
 const rows=stock.rows.map(r=>publicListing(r,vendor,{names,towns,books,now:checkedAt})).filter(Boolean);
 process.stdout.write(JSON.stringify({checkedAt,shop:publicShop(vendor,{towns,checkedAt}),rows}));
}catch{process.stderr.write('Shop verification read unavailable\n');process.exitCode=1;}
